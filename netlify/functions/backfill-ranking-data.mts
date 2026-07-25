import type { Config } from "@netlify/functions";

// ===== Backfill dos dados que alimentam os rankings ao vivo =====
//
// Os rankings deixaram de ser pré-calculados: com ~100 pessoas, o cliente monta
// tudo em cima de progress/ (que já é público) e o resultado é instantâneo, em
// vez de esperar a virada da hora. O que sobrou para um processo com credencial
// de servidor são três reparos que o cliente NÃO consegue fazer sozinho:
//
// 1) Carimbar locationId nos docs de progresso antigos. É o campo que torna o
//    ranking por local calculável sem ler users/{uid} de terceiros (as regras
//    não deixam, e com razão). Docs novos já nascem com ele; estes são o legado.
//    Idem para 'track', que docs anteriores às trilhas não têm (eram todos teen).
// 2) Espelhar as duplas antigas em pairsPublic/. Duplas novas escrevem o
//    espelho no mesmo batch; estas são anteriores à mudança.
// 3) Continuar limpando nota/destaque vazados no history (segurança, Etapa 8).
//
// Tudo é idempotente: depois da primeira passada não há mais o que reparar, e
// as execuções seguintes só varrem e não escrevem nada.

const RANKING_HIDDEN_NAMES = ['André Santana', 'Brenda Roosevelt'];
const normalizeName = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const hiddenNames = new Set(RANKING_HIDDEN_NAMES.map(normalizeName));
const isHidden = (nome: string) => hiddenNames.has(normalizeName(nome));

export default async (): Promise<Response> => {
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? '{}');
    initializeApp({ credential: cert(serviceAccount) });
  }
  const db = getFirestore(process.env.FB_FIRESTORE_DB ?? '(default)');

  const usersSnap = await db.collection('users').get();
  const users: Record<string, any> = {};
  usersSnap.forEach(d => { users[d.id] = d.data(); });

  // ---- 1 e 3: progresso (locationId + scrub de notas legadas) ----
  const progSnap = await db.collection('progress').get();
  const progWrites: Promise<any>[] = [];
  let carimbados = 0, limpos = 0;

  progSnap.forEach(d => {
    const p = d.data();
    const patch: Record<string, any> = {};

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
      if (dirty) { patch.history = clean; limpos++; }
    }

    const u = users[p.userId];
    if (u?.locationId && p.locationId !== u.locationId) {
      patch.locationId = u.locationId;
      carimbados++;
    }
    // Antes das trilhas todo progresso era teen; sem o campo, o recorte por
    // trilha teria de adivinhar a cada leitura.
    if (!p.track && u?.track) patch.track = u.track;

    if (Object.keys(patch).length) progWrites.push(d.ref.update(patch));
  });
  await Promise.all(progWrites);

  // ---- 2: espelho público das duplas ----
  const [pairsSnap, publicSnap] = await Promise.all([
    db.collection('pairs').get(),
    db.collection('pairsPublic').get(),
  ]);
  const publicById: Record<string, any> = {};
  publicSnap.forEach(d => { publicById[d.id] = d.data(); });

  const pairWrites: Promise<any>[] = [];
  let espelhados = 0, sincronizados = 0;

  pairsSnap.forEach(d => {
    const p = d.data();
    const a = users[p.userA], b = users[p.userB];
    if (!a || !b) return;
    if (a.isGuest || b.isGuest) return;
    if (isHidden(a.nome) || isHidden(b.nome)) return;
    if (!p.locationId || !p.track) return;

    const existente = publicById[d.id];
    if (!existente) {
      // Duplas já desfeitas não precisam de espelho — nasceriam inativas
      if (!p.active) return;
      pairWrites.push(d.ref.firestore.collection('pairsPublic').doc(d.id).set({
        pairId: d.id,
        members: [p.userA, p.userB],
        aId: p.userA, aNome: a.nome || p.userAName || '', aAvatar: a.avatar || p.userAAvatar || '🦁',
        bId: p.userB, bNome: b.nome || p.userBName || '', bAvatar: b.avatar || p.userBAvatar || '🦁',
        locationId: p.locationId,
        track: p.track,
        active: true,
        createdAt: p.createdAt ?? FieldValue.serverTimestamp(),
      }));
      espelhados++;
      return;
    }

    // pairs/ é a fonte da verdade do vínculo; o espelho segue o active dele.
    // Também reaproveita para atualizar nome/avatar, que o cliente não pode
    // reescrever (a regra só deixa desfazer) — assim o ranking não mostra o
    // nome antigo de quem trocou o perfil e ainda não pontuou nesta semana.
    const patch: Record<string, any> = {};
    if (existente.active !== !!p.active) patch.active = !!p.active;
    const aNome = a.nome || existente.aNome, bNome = b.nome || existente.bNome;
    const aAvatar = a.avatar || existente.aAvatar, bAvatar = b.avatar || existente.bAvatar;
    if (existente.aNome !== aNome) patch.aNome = aNome;
    if (existente.bNome !== bNome) patch.bNome = bNome;
    if (existente.aAvatar !== aAvatar) patch.aAvatar = aAvatar;
    if (existente.bAvatar !== bAvatar) patch.bAvatar = bAvatar;
    if (Object.keys(patch).length) {
      pairWrites.push(d.ref.firestore.collection('pairsPublic').doc(d.id).update(patch));
      sincronizados++;
    }
  });
  await Promise.all(pairWrites);

  const resumo = { carimbados, limpos, espelhados, sincronizados };
  console.log('Backfill concluído:', JSON.stringify(resumo));
  return new Response(JSON.stringify({ ok: true, ...resumo }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

// De hora em hora: é reparo, não caminho crítico — o ranking já é ao vivo.
export const config: Config = {
  schedule: "0 * * * *",
};
