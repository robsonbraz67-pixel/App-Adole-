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

type PairEntry = {
  id: string;
  aId: string; aNome: string; aAvatar: string;
  bId: string; bNome: string; bAvatar: string;
  diasA: number; diasB: number; juntos: number; dias: number; xp: number;
  isAdmin: boolean; isProfessor: boolean;
};

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

  // 2) Acumula por bucket = `${locationId}__${track|general}__${trimestreSlug}`.
  // Guarda por (usuário, semana) pegando o doc MAIS COMPLETO — um mesmo usuário
  // pode ter mais de um doc na mesma semana (chave legada + chave por trilha
  // criada na janela do bug de chave), e somar os dois inflaria o ranking.
  type Acc = { u: any; weeks: Record<string, { dias: number; xp: number }> };
  const buckets: Record<string, Record<string, Acc>> = {};
  const meta: Record<string, { locationId: string; track: string; trimestre: string }> = {};

  const add = (locationId: string, track: string, trimestre: string, uid: string, u: any, week: string, dias: number, xp: number) => {
    const key = `${locationId}__${track}__${slug(trimestre)}`;
    if (!buckets[key]) { buckets[key] = {}; meta[key] = { locationId, track, trimestre }; }
    const b = buckets[key];
    if (!b[uid]) b[uid] = { u, weeks: {} };
    const cur = b[uid].weeks[week];
    if (!cur || dias > cur.dias || (dias === cur.dias && xp > cur.xp)) {
      b[uid].weeks[week] = { dias, xp };
    }
  };

  // Melhor doc de progresso por (usuário, semana) — mesma regra de desempate do
  // add() acima, mas guardando os dias EM SI (não só a contagem), porque o
  // ranking de duplas precisa saber em quais dias os dois estudaram.
  const bestByUserWeek: Record<string, { uid: string; week: string; done: number[]; xp: number; trimestre: string }> = {};

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
    const done: number[] = Array.isArray(p.done) ? p.done : [];
    const dias = done.length;
    const xp = typeof p.xp === 'number' ? p.xp : 0;
    const trimestre = p.trimestre || 'sem-temporada';
    const week = typeof p.week === 'string' ? p.week : (d.id || '');
    add(u.locationId, u.track, trimestre, p.userId, u, week, dias, xp);   // ranking por trilha
    add(u.locationId, 'general', trimestre, p.userId, u, week, dias, xp); // ranking geral do local

    const bk = `${p.userId}__${week}`;
    const prev = bestByUserWeek[bk];
    if (!prev || dias > prev.done.length || (dias === prev.done.length && xp > prev.xp)) {
      bestByUserWeek[bk] = { uid: p.userId, week, done, xp, trimestre };
    }
  });
  if (scrubs.length) { await Promise.all(scrubs); console.log(`Notas legadas removidas de ${scrubs.length} docs de progresso.`); }

  // 3) Ordena por dias no período (métrica justa entre trilhas), XP como desempate,
  //    e grava um doc pronto por bucket.
  let written = 0;
  const batchWrites: Promise<any>[] = [];
  for (const key of Object.keys(buckets)) {
    const entries: Entry[] = Object.entries(buckets[key]).map(([uid, rec]) => {
      let dias = 0, xp = 0;
      for (const w of Object.values(rec.weeks)) { dias += w.dias; xp += w.xp; }
      return { id: uid, nome: rec.u.nome || '', avatar: rec.u.avatar || '🦁', dias, xp, isAdmin: !!rec.u.isAdmin, isProfessor: !!rec.u.isProfessor };
    }).sort((a, b) => (b.dias - a.dias) || (b.xp - a.xp));
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

  // 4) Ranking de DUPLAS por local+trilha+temporada.
  // A dupla já nasce presa a um local e a uma trilha (validado na regra do
  // convite), então o bucket é o mesmo do ranking individual por trilha.
  // Métrica: um dia vale 1 quando os DOIS estudaram e 0,5 quando só um estudou
  // — ou seja, dias = (diasA + diasB) / 2. `juntos` é guardado à parte para a
  // UI conseguir desenhar a parte cheia e a parte pela metade da barra.
  // NÃO publicamos o `type` da dupla (família/casal/amigo): o vínculo é
  // assunto dos dois, e o ranking é visível para todo o local.
  const byUserWeeks: Record<string, Record<string, { done: number[]; xp: number; trimestre: string }>> = {};
  for (const rec of Object.values(bestByUserWeek)) {
    if (!byUserWeeks[rec.uid]) byUserWeeks[rec.uid] = {};
    byUserWeeks[rec.uid][rec.week] = { done: rec.done, xp: rec.xp, trimestre: rec.trimestre };
  }

  const pairsSnap = await db.collection('pairs').get();
  const pairBuckets: Record<string, PairEntry[]> = {};
  const pairMeta: Record<string, { locationId: string; track: string; trimestre: string }> = {};

  pairsSnap.forEach(d => {
    const p = d.data();
    if (!p.active) return;
    const a = users[p.userA], b = users[p.userB];
    if (!a || !b) return;
    if (a.isGuest || b.isGuest) return;
    if (isHidden(a.nome) || isHidden(b.nome)) return;
    if (!p.locationId || !p.track) return;

    const semanasA = byUserWeeks[p.userA] || {};
    const semanasB = byUserWeeks[p.userB] || {};
    // Soma por temporada: uma dupla pode atravessar trimestres, e cada semana
    // sabe a qual temporada pertence (campo trimestre do progresso).
    const porTrimestre: Record<string, { diasA: number; diasB: number; juntos: number; xp: number }> = {};
    for (const week of new Set([...Object.keys(semanasA), ...Object.keys(semanasB)])) {
      const wa = semanasA[week], wb = semanasB[week];
      const trimestre = wa?.trimestre || wb?.trimestre || 'sem-temporada';
      if (!porTrimestre[trimestre]) porTrimestre[trimestre] = { diasA: 0, diasB: 0, juntos: 0, xp: 0 };
      const acc = porTrimestre[trimestre];
      const doneA = wa?.done || [], doneB = wb?.done || [];
      const setB = new Set(doneB);
      acc.diasA += doneA.length;
      acc.diasB += doneB.length;
      acc.juntos += doneA.filter(x => setB.has(x)).length;
      acc.xp += (wa?.xp || 0) + (wb?.xp || 0);
    }

    for (const [trimestre, acc] of Object.entries(porTrimestre)) {
      const key = `${p.locationId}__${p.track}__${slug(trimestre)}`;
      if (!pairBuckets[key]) { pairBuckets[key] = []; pairMeta[key] = { locationId: p.locationId, track: p.track, trimestre }; }
      pairBuckets[key].push({
        id: d.id,
        aId: p.userA, aNome: a.nome || p.userAName || '', aAvatar: a.avatar || p.userAAvatar || '🦁',
        bId: p.userB, bNome: b.nome || p.userBName || '', bAvatar: b.avatar || p.userBAvatar || '🦁',
        diasA: acc.diasA,
        diasB: acc.diasB,
        juntos: acc.juntos,
        dias: (acc.diasA + acc.diasB) / 2,
        xp: acc.xp,
        isAdmin: !!(a.isAdmin || b.isAdmin),
        isProfessor: !!(a.isProfessor || b.isProfessor),
      });
    }
  });

  // Desfazer a dupla é uma ação normal do aluno (botão "Desfazer"), então um
  // bucket pode ficar vazio. Sem esta limpeza, o último doc gravado continuaria
  // publicando duplas que já não existem — zeramos os que sumiram.
  const staleSnap = await db.collection('pairRankings').get();
  const staleWrites: Promise<any>[] = [];
  staleSnap.forEach(d => {
    if (pairBuckets[d.id]) return;
    if ((d.data().count || 0) === 0) return; // já estava zerado
    staleWrites.push(d.ref.set({ entries: [], count: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
  });
  await Promise.all(staleWrites);

  let pairsWritten = 0;
  const pairWrites: Promise<any>[] = [];
  for (const key of Object.keys(pairBuckets)) {
    const entries = pairBuckets[key].sort((x, y) => (y.dias - x.dias) || (y.juntos - x.juntos) || (y.xp - x.xp));
    const m = pairMeta[key];
    pairWrites.push(
      db.collection('pairRankings').doc(key).set({
        locationId: m.locationId,
        track: m.track,
        trimestre: m.trimestre,
        entries,
        count: entries.length,
        updatedAt: FieldValue.serverTimestamp(),
      })
    );
    pairsWritten++;
  }
  await Promise.all(pairWrites);

  console.log(`Rankings recalculados: ${written} individuais + ${pairsWritten} de duplas.`);
  return new Response(JSON.stringify({ ok: true, written, pairsWritten }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

// Recalcula de hora em hora (custo baixo, atualização razoável para um ranking de estudo)
export const config: Config = {
  schedule: "0 * * * *",
};
