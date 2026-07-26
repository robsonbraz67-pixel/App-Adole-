import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, getDocs, query, where, orderBy, limit, serverTimestamp, onSnapshot, writeBatch, Timestamp, deleteField, arrayUnion, arrayRemove } from 'firebase/firestore';
import { isRankingHidden, computeRealStreak, aggregateWeekRanking } from './utils';

const firebaseConfig = {
  projectId:         import.meta.env.VITE_FB_PROJECT_ID,
  appId:             import.meta.env.VITE_FB_APP_ID,
  apiKey:            import.meta.env.VITE_FB_API_KEY,
  authDomain:        import.meta.env.VITE_FB_AUTH_DOMAIN,
  storageBucket:     import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
};
const firestoreDatabaseId = import.meta.env.VITE_FB_FIRESTORE_DB;

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

let authInitialized = false;
let authPromise: Promise<User | null> | null = null;

export const waitForAuthInit = () => {
  if (authInitialized) return Promise.resolve(auth.currentUser);
  if (!authPromise) {
    authPromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        authInitialized = true;
        unsubscribe();
        resolve(user);
      });
    });
  }
  return authPromise;
};


export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out', error);
    throw error;
  }
};

export const saveUser = async (userProfile: any) => {
  const userRef = doc(db, 'users', userProfile.id);
  const snap = await getDoc(userRef);

  const { isNew, ...cleanProfile } = userProfile;
  if (!snap.exists() && cleanProfile.email && cleanProfile.email.toLowerCase() === 'robsonbraz67@gmail.com') {
     cleanProfile.isAdmin = true;
  }

  // Campos novos só entram quando têm valor: as regras publicadas antes
  // deles rejeitam documentos com chaves desconhecidas (save falhava p/ todos)
  if (!cleanProfile.telefone) delete cleanProfile.telefone;
  if (!cleanProfile.whatsappOptIn) delete cleanProfile.whatsappOptIn;
  if (!cleanProfile.isGuest) delete cleanProfile.isGuest;
  if (!cleanProfile.track) delete cleanProfile.track;
  if (!cleanProfile.locationId) delete cleanProfile.locationId;
  if (!cleanProfile.inviteCode) delete cleanProfile.inviteCode;

  await setDoc(userRef, {
    ...cleanProfile,
    criadoEm: cleanProfile.criadoEm || new Date().toISOString()
  }, { merge: true });
};

export const getUser = async (userId: string) => {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    const data = snap.data();
    if (data.email && data.email.toLowerCase() === 'robsonbraz67@gmail.com' && !data.isAdmin) {
      data.isAdmin = true;
      await saveUser(data);
    }
    return data;
  }
  return null;
};

export const getAllUsers = async () => {
  const usersCol = collection(db, 'users');
  const snap = await getDocs(usersCol);
  const users: any[] = [];
  snap.forEach(doc => {
    users.push({ id: doc.id, ...doc.data() });
  });
  return users;
};

export const toggleAdmin = async (userId: string, targetValue: boolean) => {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, { isAdmin: targetValue }, { merge: true });
};

export const toggleGuest = async (userId: string, targetValue: boolean) => {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, { isGuest: targetValue }, { merge: true });
};

export const toggleProfessor = async (userId: string, targetValue: boolean) => {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, { isProfessor: targetValue }, { merge: true });
};

export const blockUser = async (userId: string, blocked: boolean) => {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, { bloqueado: blocked }, { merge: true });
};

export const deleteUser = async (userId: string) => {
  await deleteDoc(doc(db, 'users', userId));
};

// Locais de estudo (igreja/grupo). Lista completa é pequena — ok carregar tudo
// de uma vez pro seletor do cadastro.
export const getStudyLocations = async (): Promise<{ id: string; name: string; createdBy: string }[]> => {
  const snap = await getDocs(collection(db, 'studyLocations'));
  const list: any[] = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
};

export const createStudyLocation = async (name: string, createdBy: string): Promise<string> => {
  const ref = doc(collection(db, 'studyLocations'));
  await setDoc(ref, { name: name.trim(), createdBy, createdAt: serverTimestamp() });
  return ref.id;
};

// Só admin altera o local de um usuário depois do cadastro (correção de erro, mudança de igreja etc.)
export const adminSetUserLocation = async (userId: string, locationId: string) => {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, { locationId }, { merge: true });
};

// Admin define em qual local cada professor pode gerar convite
export const assignTeacherLocation = async (teacherId: string, locationId: string, assignedBy: string) => {
  const ref = doc(db, 'teacherAssignments', teacherId);
  await setDoc(ref, { locationId, assignedBy, assignedAt: serverTimestamp() });
};

export const removeTeacherAssignment = async (teacherId: string) => {
  await deleteDoc(doc(db, 'teacherAssignments', teacherId));
};

export const getTeacherAssignment = async (teacherId: string) => {
  const ref = doc(db, 'teacherAssignments', teacherId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() as { locationId: string; assignedBy: string; assignedAt: any } : null;
};

// Painel Admin: mapa completo {teacherId: {...}} para exibir o local de cada professor
export const getAllTeacherAssignments = async (): Promise<Record<string, { locationId: string; assignedBy: string; assignedAt: any }>> => {
  const snap = await getDocs(collection(db, 'teacherAssignments'));
  const map: Record<string, any> = {};
  snap.forEach(d => { map[d.id] = d.data(); });
  return map;
};

// ===== Códigos de convite por local + trilha (Etapa 3) =====
// Doc id == o próprio código, para resgate por leitura direta (sem precisar de
// permissão de list para quem resgata). Alfabeto sem caracteres ambíguos (0/O/1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TRACK_PREFIX: Record<string, string> = { teen: 'TEEN', youngAdult: 'JOV', adult: 'ADT' };

const randomCodeSuffix = (len = 5) => {
  let s = '';
  const arr = new Uint32Array(len);
  (globalThis.crypto || (window as any).crypto).getRandomValues(arr);
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[arr[i] % CODE_ALPHABET.length];
  return s;
};

export const normalizeInviteCode = (code: string) => (code || '').trim().toUpperCase().replace(/\s+/g, '');

// Cria um código novo para (locationId, track). createdBy = quem gerou.
// A regra do Firestore garante que professor só cria para o local atribuído a ele.
export const generateInviteCode = async (locationId: string, track: string, createdBy: string): Promise<string> => {
  // tenta algumas vezes para o caso raríssimo de colisão de sufixo
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `${TRACK_PREFIX[track] || 'TRK'}-${randomCodeSuffix()}`;
    const ref = doc(db, 'inviteCodes', code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;
    await setDoc(ref, { code, locationId, track, active: true, createdBy, createdAt: serverTimestamp() });
    return code;
  }
  throw new Error('Não foi possível gerar um código único. Tente novamente.');
};

// Lista códigos. Admin vê todos; professor filtra pelo próprio local (client-side,
// já que a regra permite list para quem gerencia).
export const getInviteCodes = async (locationId?: string): Promise<any[]> => {
  const base = collection(db, 'inviteCodes');
  const snap = locationId
    ? await getDocs(query(base, where('locationId', '==', locationId)))
    : await getDocs(base);
  const list: any[] = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list.sort((a, b) => (a.createdAt?.seconds || 0) < (b.createdAt?.seconds || 0) ? 1 : -1);
};

// Revoga/reativa: a regra só deixa alterar o campo 'active'.
export const setInviteCodeActive = async (code: string, active: boolean) => {
  await setDoc(doc(db, 'inviteCodes', code), { active }, { merge: true });
};

export const deleteInviteCode = async (code: string) => {
  await deleteDoc(doc(db, 'inviteCodes', code));
};

// Resgate: leitura direta pelo código (== doc id). Retorna null se não existir.
export const getInviteCodeByCode = async (code: string): Promise<{ code: string; locationId: string; track: string; active: boolean } | null> => {
  const ref = doc(db, 'inviteCodes', normalizeInviteCode(code));
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() as any : null;
};

export const getAdminIds = async (): Promise<Set<string>> => {
  try {
    const q = query(collection(db, 'users'), where('isAdmin', '==', true));
    const snap = await getDocs(q);
    const ids = new Set<string>();
    snap.forEach(d => ids.add(d.id));
    return ids;
  } catch {
    return new Set<string>();
  }
};

// Remove nota/hl (conteúdo privado) do history antes de mandar pro Firestore:
// o doc de progresso é legível por qualquer autenticado (ranking), então nota
// e destaque NUNCA podem morar nele (Etapa 8). Eles vão para studyNotes (privado).
const stripPrivateNotes = (history: any): any => {
  if (!history || typeof history !== 'object') return history;
  const clean: any = {};
  for (const dayId of Object.keys(history)) {
    const { nota, hl, ...rest } = history[dayId] || {};
    clean[dayId] = rest; // mantém xp/acertos do quiz; descarta nota/hl
  }
  return clean;
};

// Chave do doc de progresso/nota. IMPORTANTE p/ compatibilidade: todo o
// histórico (antes da trilha adulto, quando todos eram 'teen') vive na chave
// LEGADA `${userId}_${week}`. Por isso 'teen' (e ausência de trilha) continua
// usando a chave legada — sem migração, sem perder dados. As trilhas novas
// (adult/youngAdult) usam chave própria, mantendo o progresso separado por
// trilha para quem tem acesso a mais de uma (admin/professor).
const trackKey = (userId: string, week: string, track?: string) =>
  (!track || track === 'teen') ? `${userId}_${week}` : `${userId}_${track}_${week}`;

export const saveProgress = async (prog: any, week: string, userId: string, nome: string, avatar: string, trimestre: string, track: string, isAdmin?: boolean, isGuest?: boolean, isProfessor?: boolean, locationId?: string) => {
  const progId = trackKey(userId, week, track);
  const progRef = doc(db, 'progress', progId);
  await setDoc(progRef, {
    userId,
    week,
    track,
    trimestre,
    // Carimba o local para o ranking por local ser calculável ao vivo pelo
    // cliente (a regra confere que é mesmo o local do dono). Só quando existe:
    // usuário ainda não matriculado não tem local para gravar.
    ...(locationId ? { locationId } : {}),
    xp: prog.xp,
    streak: prog.streak,
    done: prog.done,
    history: stripPrivateNotes(prog.history),
    nome,
    avatar,
    isAdmin: !!isAdmin,
    // Só envia isGuest/isProfessor quando true: as regras publicadas antes desses
    // campos rejeitam documentos com chaves desconhecidas, o que quebrava o save de todos
    ...(isGuest ? { isGuest: true } : {}),
    ...(isProfessor ? { isProfessor: true } : {}),
    updatedAt: serverTimestamp()
  }, { merge: true });
};

// Mescla dois docs de progresso SEM perder nada: une os dias concluídos,
// junta o history por dia (fica com a entrada de maior XP), e recalcula o XP
// total a partir do history (com piso no maior XP dos dois, por segurança).
// Exportado: também serve para reconciliar o progresso LOCAL (localStorage)
// com o do servidor no boot — sem isso, um quiz que terminou mas nunca
// sincronizou (ex: bug de regra, ou só falta de rede) seria APAGADO no
// próximo login, porque o boot sobrescrevia o local com o valor do servidor.
export const mergeProgress = (a: any, b: any) => {
  if (!a) return b;
  if (!b) return a;
  const done = Array.from(new Set([...(a.done || []), ...(b.done || [])])).sort((x: any, y: any) => x - y);
  const history: any = { ...(a.history || {}) };
  for (const [dia, entry] of Object.entries(b.history || {})) {
    const cur = history[dia];
    if (!cur || ((entry as any)?.xp || 0) > (cur?.xp || 0)) history[dia] = entry;
  }
  let xp = 0;
  for (const e of Object.values(history)) xp += ((e as any)?.xp || 0);
  xp = Math.max(xp, a.xp || 0, b.xp || 0);
  const base = (a.done?.length || 0) >= (b.done?.length || 0) ? a : b; // nome/avatar/etc.
  return { ...base, done, history, xp, streak: Math.max(a.streak || 0, b.streak || 0) };
};

export const getProgress = async (userId: string, week: string, track: string) => {
  const snap = await getDoc(doc(db, 'progress', trackKey(userId, week, track)));
  const main = snap.exists() ? snap.data() : null;
  // Recuperação: durante a janela do bug de chave (deploy que gravava sempre
  // `${userId}_${track}_${week}`, inclusive teen), o progresso teen pode ter
  // ido parar em `${userId}_teen_${week}`. Se existir, MESCLA (une os dias),
  // para ninguém perder o que fez naquele intervalo. O próximo save do usuário
  // grava o resultado mesclado na chave legada, então isso se auto-corrige.
  if (!track || track === 'teen') {
    try {
      const janelaSnap = await getDoc(doc(db, 'progress', `${userId}_teen_${week}`));
      if (janelaSnap.exists()) return mergeProgress(main, janelaSnap.data());
    } catch { /* ignora — a recuperação é best-effort */ }
  }
  return main;
};

// ===== Anotações privadas (Etapa 8) =====
// nota/destaque do usuário ficam aqui, legíveis SÓ pelo dono — nunca no
// progress (que é público para o ranking).
export const saveStudyNote = async (userId: string, week: string, track: string, dayId: number, nota: string, hl: any) => {
  const ref = doc(db, 'studyNotes', trackKey(userId, week, track));
  await setDoc(ref, {
    userId,
    week,
    track,
    notes: { [String(dayId)]: { nota: nota || '', hl: hl || {} } },
    updatedAt: serverTimestamp(),
  }, { merge: true });
};

export const getStudyNotes = async (userId: string, week: string, track: string): Promise<Record<string, { nota: string; hl: any }>> => {
  const ref = doc(db, 'studyNotes', trackKey(userId, week, track));
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data().notes || {}) : {};
};

// Mapa { semana: [diaIds concluídos] } das semanas do usuário — usado para
// marcar dias já feitos em semanas anteriores. Consulta só por userId: os
// docs legados (histórico) não têm campo `track`, então filtrar por trilha
// no servidor excluiria justamente o histórico.
export const getUserAllDone = async (userId: string, _track?: string): Promise<Record<string, number[]>> => {
  const snap = await getDocs(query(collection(db, 'progress'), where('userId', '==', userId)));
  const map: Record<string, number[]> = {};
  snap.forEach(doc => {
    const data = doc.data();
    // Se houver mais de um doc para a mesma semana (ex.: legado + janela do
    // bug), fica com o mais completo para não "desmarcar" dias já feitos.
    const done = data.done || [];
    if (!map[data.week] || done.length > map[data.week].length) map[data.week] = done;
  });
  return map;
};

export const getDayOverride = async (track: string, semana: string, diaId: number) => {
  const ref = doc(db, 'conteudoOverrides', `${track}_${semana}_${diaId}`);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
};

export const saveDayOverride = async (track: string, semana: string, diaId: number, data: any) => {
  const ref = doc(db, 'conteudoOverrides', `${track}_${semana}_${diaId}`);
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
};

// ===== Estudo em Dupla (Etapa 4) =====
const PAIR_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const randomId = (len = 20) => {
  const alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const arr = new Uint32Array(len);
  (globalThis.crypto || (window as any).crypto).getRandomValues(arr);
  let s = '';
  for (let i = 0; i < len; i++) s += alpha[arr[i] % alpha.length];
  return s;
};

export type PairType = 'family' | 'couple' | 'friend';

// Dupla ativa do usuário (no máx. 1). Usa só array-contains (índice automático)
// e filtra 'active' no cliente — evita exigir índice composto no Firestore.
export const getActivePair = async (userId: string): Promise<any | null> => {
  const snap = await getDocs(query(collection(db, 'pairs'), where('members', 'array-contains', userId)));
  let pair: any = null;
  snap.forEach(d => { const data = d.data(); if (!pair && data.active) pair = { id: d.id, ...data }; });
  return pair;
};

// Cria o convite de dupla. Só quem tem locationId+track (matriculado) pode.
export const createPairInvite = async (jogador: any, type: PairType): Promise<string> => {
  if (!jogador.locationId || !jogador.track) throw new Error('Complete seu cadastro (local e trilha) antes de convidar.');
  const inviteId = randomId();
  await setDoc(doc(db, 'pairInvites', inviteId), {
    createdBy: jogador.id,
    createdByName: jogador.nome || '',
    createdByAvatar: jogador.avatar || '',
    locationId: jogador.locationId,
    track: jogador.track,
    type,
    status: 'pending',
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + PAIR_INVITE_TTL_MS),
  });
  return inviteId;
};

export const getPairInvite = async (inviteId: string): Promise<any | null> => {
  const snap = await getDoc(doc(db, 'pairInvites', inviteId));
  return snap.exists() ? { id: inviteId, ...snap.data() } : null;
};

// Motivos de recusa amigáveis para a UI decidir a mensagem.
export type AcceptPairResult =
  | { ok: true; pairId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'self' | 'mismatch' | 'already_paired' | 'error' };

export const acceptPairInvite = async (inviteId: string, jogador: any): Promise<AcceptPairResult> => {
  try {
    const inv = await getPairInvite(inviteId);
    if (!inv || inv.status !== 'pending') return { ok: false, reason: 'not_found' };
    const expMs = inv.expiresAt?.toMillis ? inv.expiresAt.toMillis() : 0;
    if (expMs && expMs < Date.now()) return { ok: false, reason: 'expired' };
    if (inv.createdBy === jogador.id) return { ok: false, reason: 'self' };
    if (inv.locationId !== jogador.locationId || inv.track !== jogador.track) return { ok: false, reason: 'mismatch' };
    // Uma dupla ativa por vez (checagem no cliente; a regra garante o resto).
    // Só dá pra checar a PRÓPRIA dupla aqui — a regra do Firestore não deixa
    // consultar as duplas de outro usuário (query 'array-contains' exige que o
    // uid buscado seja o do próprio autenticado). Se quem convidou já tiver
    // uma dupla ativa, o pior caso é um vínculo extra que fica invisível pra
    // ele (getActivePair só retorna a primeira encontrada) — não é falha de
    // segurança, só uma checagem de UX que não dá pra fazer nos dois lados.
    const mine = await getActivePair(jogador.id);
    if (mine) return { ok: false, reason: 'already_paired' };

    const batch = writeBatch(db);
    batch.set(doc(db, 'pairs', inviteId), {
      inviteId,
      members: [inv.createdBy, jogador.id],
      userA: inv.createdBy,
      userB: jogador.id,
      userAName: inv.createdByName || '',
      userAAvatar: inv.createdByAvatar || '',
      userBName: jogador.nome || '',
      userBAvatar: jogador.avatar || '',
      locationId: inv.locationId,
      track: inv.track,
      type: inv.type,
      active: true,
      createdAt: serverTimestamp(),
      sharesA: {},
      sharesB: {},
    });
    // Espelho público da escalação, no MESMO batch — é o que permite montar o
    // ranking de duplas ao vivo sem expor as anotações que ficam em pairs/.
    batch.set(doc(db, 'pairsPublic', inviteId), {
      pairId: inviteId,
      members: [inv.createdBy, jogador.id],
      aId: inv.createdBy,
      aNome: inv.createdByName || '',
      aAvatar: inv.createdByAvatar || '🦁',
      bId: jogador.id,
      bNome: jogador.nome || '',
      bAvatar: jogador.avatar || '🦁',
      locationId: inv.locationId,
      track: inv.track,
      active: true,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'pairInvites', inviteId), { status: 'accepted' });
    await batch.commit();
    return { ok: true, pairId: inviteId };
  } catch (e) {
    console.error('acceptPairInvite', e);
    return { ok: false, reason: 'error' };
  }
};

// Desfaz nos dois lugares atomicamente: se só um caísse, a dupla sumiria do
// feed mas continuaria no ranking (ou o contrário).
export const unpair = async (pairId: string) => {
  const pubRef = doc(db, 'pairsPublic', pairId);
  // Duplas anteriores a pairsPublic ainda não têm espelho; o backfill cria com
  // o active certo. Um `set` com merge viraria create e a regra (com razão)
  // recusaria um doc só com `active`, derrubando o batch inteiro.
  const pub = await getDoc(pubRef).catch(() => null);
  const batch = writeBatch(db);
  batch.set(doc(db, 'pairs', pairId), { active: false }, { merge: true });
  if (pub?.exists()) batch.update(pubRef, { active: false });
  await batch.commit();
};

// Escuta a dupla em tempo real (feed). Retorna unsubscribe.
export const listenToPair = (pairId: string, cb: (pair: any | null) => void) => {
  return onSnapshot(doc(db, 'pairs', pairId), snap => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null));
};

// Define/remove o compartilhamento de um item (nota ou destaques) de um dia.
// Cada membro só escreve no próprio campo (sharesA xor sharesB) — garantido na regra.
export const setPairShare = async (
  pairId: string,
  isUserA: boolean,
  week: string,
  dayId: number,
  data: { note?: string; highlights?: string[] } | null
) => {
  const field = isUserA ? 'sharesA' : 'sharesB';
  const key = `${week}__${dayId}`;
  await setDoc(doc(db, 'pairs', pairId), {
    [field]: { [key]: data === null ? deleteField() : data },
  }, { merge: true });
};

// ===== Rankings ao vivo =====
// Tudo é derivado da coleção progress, que já é pública para o ranking. Nada
// de doc pré-calculado no meio do caminho: a escala aqui (uma escola sabatina,
// ~100 pessoas) torna o cálculo no cliente mais barato E instantâneo.
//
// Um usuário pode ter mais de um doc na mesma semana (chave legada + chave por
// trilha da janela do bug, ou trilhas diferentes para admin/professor). Todo
// agregador colapsa por (usuário, semana) ficando com o doc MAIS COMPLETO —
// nunca duplica a linha nem soma duas trilhas, o que seria injusto no ranking.

// Linha crua de progresso, já filtrada (convidado e nomes ocultos ficam fora)
export type ProgressRow = {
  id: string; userId: string; week: string; trimestre?: string; track?: string;
  locationId?: string; nome: string; avatar: string; done: number[]; dias: number;
  xp: number; isAdmin: boolean; isProfessor: boolean;
};

const rowsFromSnap = (snap: any, adminIds: Set<string>): ProgressRow[] => {
  const rows: ProgressRow[] = [];
  snap.forEach((d: any) => {
    const data = d.data();
    if (isRankingHidden(data.nome)) return;
    if (data.isGuest) return;
    rows.push({
      ...data,
      id: data.userId,
      done: data.done || [],
      dias: data.done?.length || 0,
      xp: data.xp || 0,
      isAdmin: data.isAdmin || adminIds.has(data.userId),
      isProfessor: !!data.isProfessor,
    });
  });
  return rows;
};

// Assina o progresso de uma semana. É a base ao vivo do ranking da semana e do
// de duplas — ~1 doc por aluno, o caminho quente e mais barato do app.
export const listenToWeekProgress = (week: string, cb: (rows: ProgressRow[]) => void) => {
  let stop = false;
  let unsub: (() => void) | null = null;
  getAdminIds().then(adminIds => {
    if (stop) return;
    unsub = onSnapshot(
      query(collection(db, 'progress'), where('week', '==', week)),
      snap => cb(rowsFromSnap(snap, adminIds)),
      err => console.error('listenToWeekProgress', err),
    );
  });
  return () => { stop = true; unsub?.(); };
};

// Progresso da campanha inteira (13 semanas). Leitura pontual, não assinatura:
// é ~13× mais docs que a semana e muda devagar. A semana corrente é sobreposta
// ao vivo por cima disto (ver mergeLiveWeek), então o total nunca fica atrasado.
//
// Busca pelas SEMANAS, não pelo trimestre: 'week' é obrigatório nas regras
// (todo doc de progresso tem), enquanto 'trimestre' é opcional e só passou a
// ser gravado em 27/06 — filtrar por ele fazia as semanas antigas sumirem do
// acumulado sem erro nenhum, só faltando pontos.
export const getSeasonProgress = async (semanas: string[]): Promise<ProgressRow[]> => {
  if (!semanas?.length) return [];
  // 'in' aceita até 30 valores; uma campanha tem 13, mas o lote protege o caso
  // de alguém montar uma campanha maior no futuro.
  const lotes: string[][] = [];
  for (let i = 0; i < semanas.length; i += 30) lotes.push(semanas.slice(i, i + 30));
  const [adminIds, ...snaps] = await Promise.all([
    getAdminIds(),
    ...lotes.map(lote => getDocs(query(collection(db, 'progress'), where('week', 'in', lote)))),
  ]);
  return (snaps as any[]).flatMap(snap => rowsFromSnap(snap, adminIds));
};

export const getWeeklyRanking = async (week: string) => {
  const [snap, adminIds] = await Promise.all([
    getDocs(query(collection(db, 'progress'), where('week', '==', week))),
    getAdminIds(),
  ]);
  return aggregateWeekRanking(rowsFromSnap(snap, adminIds));
};


// ===== Escalação pública das duplas (ao vivo) =====
// pairs/ só pode ser lido pelos dois membros — guarda as anotações
// compartilhadas. pairsPublic/ é o espelho enxuto (quem forma cada dupla, sem
// anotações e sem o tipo do vínculo) que deixa o ranking de duplas ser montado
// ao vivo no cliente. Escrito no mesmo batch de pairs/, nunca diverge.
export type PairRosterEntry = {
  id: string;
  aId: string; aNome: string; aAvatar: string;
  bId: string; bNome: string; bAvatar: string;
  locationId: string; track: string;
};

const rosterFromSnap = (snap: any, track: string): PairRosterEntry[] => {
  const out: PairRosterEntry[] = [];
  snap.forEach((d: any) => {
    const p = d.data();
    // active/track filtrados aqui: a query usa só locationId (índice
    // automático de campo único), evitando exigir índice composto.
    if (!p.active || p.track !== track) return;
    out.push({
      id: d.id,
      aId: p.aId, aNome: p.aNome || '', aAvatar: p.aAvatar || '🦁',
      bId: p.bId, bNome: p.bNome || '', bAvatar: p.bAvatar || '🦁',
      locationId: p.locationId, track: p.track,
    });
  });
  return out;
};

export const listenToPairRoster = (locationId: string, track: string, cb: (roster: PairRosterEntry[]) => void) => {
  if (!locationId) { cb([]); return () => {}; }
  return onSnapshot(
    query(collection(db, 'pairsPublic'), where('locationId', '==', locationId)),
    snap => cb(rosterFromSnap(snap, track)),
    err => { console.error('listenToPairRoster', err); cb([]); },
  );
};

// Ofensiva real de todos os usuários da temporada (para o painel Admin/Professor)
// `licoes` vem de fora: o conteúdo é carregado sob demanda por trilha, então
// firebase.ts não pode mais importá-lo estaticamente (e nem deveria). A busca é
// pelas SEMANAS dessas lições — mesma razão do getSeasonProgress: 'trimestre'
// falta nos docs antigos e a ofensiva vinha curta sem dar erro.
export const getAllUsersStreaks = async (licoes: any[]): Promise<Record<string, { nome: string; avatar: string; streak: number; isAdmin: boolean; isProfessor: boolean }>> => {
  const semanas = (licoes || []).map((l: any) => l.semana).filter(Boolean);
  if (!semanas.length) return {};
  const lotes: string[][] = [];
  for (let i = 0; i < semanas.length; i += 30) lotes.push(semanas.slice(i, i + 30));
  const snaps = await Promise.all(lotes.map(lote => getDocs(query(collection(db, 'progress'), where('week', 'in', lote)))));
  const porUsuario: Record<string, { nome: string; avatar: string; done: Record<string, number[]>; isAdmin?: boolean; isProfessor?: boolean }> = {};
  snaps.forEach(snap => snap.forEach(doc => {
    const d = doc.data();
    if (!porUsuario[d.userId]) porUsuario[d.userId] = { nome: d.nome, avatar: d.avatar, done: {}, isAdmin: d.isAdmin, isProfessor: d.isProfessor };
    porUsuario[d.userId].done[d.week] = d.done || [];
  }));
  const resultado: Record<string, any> = {};
  for (const uid of Object.keys(porUsuario)) {
    const u = porUsuario[uid];
    resultado[uid] = { nome: u.nome, avatar: u.avatar, isAdmin: !!u.isAdmin, isProfessor: !!u.isProfessor, streak: computeRealStreak(u.done, licoes) };
  }
  return resultado;
};
