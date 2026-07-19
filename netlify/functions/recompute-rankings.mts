import type { Config } from "@netlify/functions";

// ===== Ranking pré-calculado por local + trilha (Etapa 6) =====
//
// Por que uma função agendada (e não cálculo no cliente)?
// 1) Custo/performance: o ranking é lido O(1) (um doc pronto) em vez de cada
//    usuário varrer toda a coleção de progresso a cada acesso.
// 2) Privacidade/escopo: para montar um ranking por LOCAL é preciso saber o
//    locationId de cada usuário, que mora em users/{uid}. As regras não deixam
//    um aluno comum ler o doc de outro usuário — então só um processo com
//    credencial de servidor (admin SDK) consegue juntar progresso + local.
//
// Roda no mesmo esquema do send-reminders.mts: Netlify scheduled function +
// firebase-admin + FIREBASE_SERVICE_ACCOUNT (já configurado). Sem Firebase
// Cloud Functions, sem billing novo.
//
// Índices compostos: a função lê a coleção inteira com um único .get() por
// coleção (users e progress) e agrupa em memória — nenhuma query composta,
// logo nenhum índice composto necessário. Se o volume crescer muito, dá para
// trocar por queries paginadas por locationId (aí sim exigiria índice), mas
// para a escala de escolas sabatinas o full-scan horário é barato e simples.

const RANKING_HIDDEN_NAMES = ['André Santana', 'Brenda Roosevelt'];
const normalizeName = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const hiddenNames = new Set(RANKING_HIDDEN_NAMES.map(normalizeName));
const isHidden = (nome: string) => hiddenNames.has(normalizeName(nome));

// Precisa bater EXATAMENTE com rankingSlug() no cliente (firebase.ts)
const slug = (s: string) => (s || 'sem-temporada').replace(/[^A-Za-z0-9]+/g, '_');

type Entry = { id: string; nome: string; avatar: string; dias: number; xp: number; isAdmin: boolean; isProfessor: boolean };

export default async (): Promise<Response> => {
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? '{}');
    initializeApp({ credential: cert(serviceAccount) });
  }
  const db = getFirestore(process.env.FB_FIRESTORE_DB ?? '(default)');

  // 1) Usuários → mapa uid -> perfil (para descobrir locationId/track de cada progresso)
  const usersSnap = await db.collection('users').get();
  const users: Record<string, any> = {};
  usersSnap.forEach(d => { users[d.id] = d.data(); });

  // 2) Acumula por bucket = `${locationId}__${track|general}__${trimestreSlug}`
  const buckets: Record<string, Record<string, Entry>> = {};
  const meta: Record<string, { locationId: string; track: string; trimestre: string }> = {};

  const add = (locationId: string, track: string, trimestre: string, uid: string, u: any, dias: number, xp: number) => {
    const key = `${locationId}__${track}__${slug(trimestre)}`;
    if (!buckets[key]) { buckets[key] = {}; meta[key] = { locationId, track, trimestre }; }
    const b = buckets[key];
    if (!b[uid]) b[uid] = { id: uid, nome: u.nome || '', avatar: u.avatar || '🦁', dias: 0, xp: 0, isAdmin: !!u.isAdmin, isProfessor: !!u.isProfessor };
    b[uid].dias += dias;
    b[uid].xp += xp;
  };

  const progSnap = await db.collection('progress').get();
  // Scrub de notas antigas já vazadas (Etapa 8): progress é público para o
  // ranking, então nota/hl no history são um vazamento. Limpamos legados aqui
  // (idempotente — depois da 1ª passada não há mais o que limpar).
  const scrubs: Promise<any>[] = [];
  progSnap.forEach(d => {
    const p = d.data();

    const history = p.history;
    if (history && typeof history === 'object') {
      let dirty = false;
      const clean: any = {};
      for (const dayId of Object.keys(history)) {
        const entry = history[dayId] || {};
        if (entry.nota !== undefined || entry.hl !== undefined) {
          dirty = true;
          const { nota, hl, ...rest } = entry;
          clean[dayId] = rest;
        } else {
          clean[dayId] = entry;
        }
      }
      if (dirty) scrubs.push(d.ref.update({ history: clean }));
    }

    const u = users[p.userId];
    if (!u || !u.locationId || !u.track) return;   // não matriculado → fora de qualquer local
    if (u.isGuest) return;                          // convidado não entra em ranking
    if (isHidden(u.nome)) return;                   // nomes ocultos (contas de teste)
    const dias = Array.isArray(p.done) ? p.done.length : 0;
    const xp = typeof p.xp === 'number' ? p.xp : 0;
    const trimestre = p.trimestre || 'sem-temporada';
    add(u.locationId, u.track, trimestre, p.userId, u, dias, xp);   // ranking por trilha
    add(u.locationId, 'general', trimestre, p.userId, u, dias, xp); // ranking geral do local
  });
  if (scrubs.length) { await Promise.all(scrubs); console.log(`Notas legadas removidas de ${scrubs.length} docs de progresso.`); }

  // 3) Ordena por dias no período (métrica justa entre trilhas), XP como desempate,
  //    e grava um doc pronto por bucket.
  let written = 0;
  const batchWrites: Promise<any>[] = [];
  for (const key of Object.keys(buckets)) {
    const entries = Object.values(buckets[key]).sort((a, b) => (b.dias - a.dias) || (b.xp - a.xp));
    const m = meta[key];
    batchWrites.push(
      db.collection('rankings').doc(key).set({
        locationId: m.locationId,
        track: m.track,
        trimestre: m.trimestre,
        entries,
        count: entries.length,
        updatedAt: FieldValue.serverTimestamp(),
      })
    );
    written++;
  }
  await Promise.all(batchWrites);

  console.log(`Rankings recalculados: ${written} docs (locais×trilhas×temporadas).`);
  return new Response(JSON.stringify({ ok: true, written }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

// Recalcula de hora em hora (custo baixo, atualização razoável para um ranking de estudo)
export const config: Config = {
  schedule: "0 * * * *",
};
