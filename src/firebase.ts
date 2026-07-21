import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, getDocs, query, where, orderBy, limit, serverTimestamp, onSnapshot, writeBatch, Timestamp, deleteField, arrayUnion, arrayRemove } from 'firebase/firestore';
import { isRankingHidden, computeRealStreak } from './utils';
import { LICOES } from './data';
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
export const googleProvider = new GoogleAuthProvider();

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

export const sendManualNotification = async (userIds: string[], title: string, body: string) => {
  const now = new Date().getTime();
  for (const uid of userIds) {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, { manualNotification: { title, body, timestamp: now } }, { merge: true });
  }
};

export const listenToUserNotifications = (userId: string, callback: (notification: any) => void) => {
  const userRef = doc(db, 'users', userId);
  return onSnapshot(userRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.manualNotification) {
        callback(data.manualNotification);
      }
    }
  });
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

export const saveProgress = async (prog: any, week: string, userId: string, nome: string, avatar: string, trimestre: string, track: string, isAdmin?: boolean, isGuest?: boolean, isProfessor?: boolean) => {
  const progId = `${userId}_${track}_${week}`;
  const progRef = doc(db, 'progress', progId);
  await setDoc(progRef, {
    userId,
    week,
    track,
    trimestre,
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

export const getProgress = async (userId: string, week: string, track: string) => {
  const progId = `${userId}_${track}_${week}`;
  const progRef = doc(db, 'progress', progId);
  const snap = await getDoc(progRef);
  return snap.exists() ? snap.data() : null;
};

// ===== Anotações privadas (Etapa 8) =====
// nota/destaque do usuário ficam aqui, legíveis SÓ pelo dono — nunca no
// progress (que é público para o ranking).
export const saveStudyNote = async (userId: string, week: string, track: string, dayId: number, nota: string, hl: any) => {
  const ref = doc(db, 'studyNotes', `${userId}_${track}_${week}`);
  await setDoc(ref, {
    userId,
    week,
    track,
    notes: { [String(dayId)]: { nota: nota || '', hl: hl || {} } },
    updatedAt: serverTimestamp(),
  }, { merge: true });
};

export const getStudyNotes = async (userId: string, week: string, track: string): Promise<Record<string, { nota: string; hl: any }>> => {
  const ref = doc(db, 'studyNotes', `${userId}_${track}_${week}`);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data().notes || {}) : {};
};

// Mapa { semana: [diaIds concluídos] } das semanas do usuário NA TRILHA
// informada — usado para marcar dias já feitos em semanas anteriores.
export const getUserAllDone = async (userId: string, track: string): Promise<Record<string, number[]>> => {
  const snap = await getDocs(query(collection(db, 'progress'), where('userId', '==', userId), where('track', '==', track)));
  const map: Record<string, number[]> = {};
  snap.forEach(doc => {
    const data = doc.data();
    map[data.week] = data.done || [];
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
    batch.update(doc(db, 'pairInvites', inviteId), { status: 'accepted' });
    await batch.commit();
    return { ok: true, pairId: inviteId };
  } catch (e) {
    console.error('acceptPairInvite', e);
    return { ok: false, reason: 'error' };
  }
};

export const unpair = async (pairId: string) => {
  await setDoc(doc(db, 'pairs', pairId), { active: false }, { merge: true });
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

// ===== Grupo de Estudo (Etapa 5) =====
// Reaproveita boa parte da estrutura da dupla, mas: N membros, convite
// reutilizável (não uso único), e não expõe anotação individual — só
// progresso (quem completou o dia) + destaques compartilhados (opt-in).

export const createGroup = async (jogador: any, name: string, maxMembers: number): Promise<string> => {
  if (!jogador.locationId || !jogador.track) throw new Error('Complete seu cadastro (local e trilha) antes de criar um grupo.');
  const ref = doc(collection(db, 'groups'));
  await setDoc(ref, {
    name: name.trim(),
    leaderId: jogador.id,
    locationId: jogador.locationId,
    track: jogador.track,
    memberIds: [jogador.id],
    maxMembers,
    active: true,
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const getGroup = async (groupId: string): Promise<any | null> => {
  const snap = await getDoc(doc(db, 'groups', groupId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const listenToGroup = (groupId: string, cb: (group: any | null) => void) => {
  return onSnapshot(doc(db, 'groups', groupId), snap => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null));
};

// Grupos ativos dos quais o usuário faz parte (array-contains puro, sem índice composto)
export const getMyGroups = async (userId: string): Promise<any[]> => {
  const snap = await getDocs(query(collection(db, 'groups'), where('memberIds', 'array-contains', userId)));
  const list: any[] = [];
  snap.forEach(d => { const data = d.data(); if (data.active) list.push({ id: d.id, ...data }); });
  return list;
};

// Convite reutilizável: só o líder do grupo cria. Continua válido até o
// líder desativar (active=false) ou encerrar o grupo inteiro.
export const createGroupInvite = async (jogador: any, groupId: string): Promise<string> => {
  if (!jogador.locationId || !jogador.track) throw new Error('Complete seu cadastro antes de convidar.');
  const ref = doc(collection(db, 'groupInvites'));
  await setDoc(ref, {
    groupId,
    createdBy: jogador.id,
    locationId: jogador.locationId,
    track: jogador.track,
    active: true,
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const getGroupInvite = async (inviteId: string): Promise<any | null> => {
  const snap = await getDoc(doc(db, 'groupInvites', inviteId));
  return snap.exists() ? { id: inviteId, ...snap.data() } : null;
};

export type JoinGroupResult =
  | { ok: true; groupId: string }
  | { ok: false; reason: 'not_found' | 'mismatch' | 'rejected' | 'error' };

export const joinGroupByInvite = async (inviteId: string, jogador: any): Promise<JoinGroupResult> => {
  try {
    const inv = await getGroupInvite(inviteId);
    if (!inv || !inv.active) return { ok: false, reason: 'not_found' };
    if (inv.locationId !== jogador.locationId || inv.track !== jogador.track) return { ok: false, reason: 'mismatch' };
    // Não dá pra ler o grupo (groups/{id}) antes de já ser membro — a regra de
    // leitura exige membership, e é exatamente isso que ainda não temos aqui.
    // Então entra direto: a regra do servidor (isSelfJoiningGroup) garante
    // grupo ativo, limite de membros e local+trilha batendo. Se falhar, não dá
    // pra distinguir "cheio" de "encerrado" no cliente — mensagem genérica.
    try {
      await setDoc(doc(db, 'groups', inv.groupId), {
        memberIds: arrayUnion(jogador.id),
      }, { merge: true });
    } catch (writeErr) {
      console.error('joinGroupByInvite write', writeErr);
      return { ok: false, reason: 'rejected' };
    }
    return { ok: true, groupId: inv.groupId };
  } catch (e) {
    console.error('joinGroupByInvite', e);
    return { ok: false, reason: 'error' };
  }
};

export const leaveGroup = async (groupId: string, userId: string) => {
  await setDoc(doc(db, 'groups', groupId), { memberIds: arrayRemove(userId) }, { merge: true });
};

// Líder remove um membro (não a si mesmo — use closeGroup para encerrar)
export const removeGroupMember = async (groupId: string, memberId: string) => {
  await setDoc(doc(db, 'groups', groupId), { memberIds: arrayRemove(memberId) }, { merge: true });
};

export const closeGroup = async (groupId: string) => {
  await setDoc(doc(db, 'groups', groupId), { active: false }, { merge: true });
};

// Destaques compartilhados do grupo: subcoleção (1 doc por membro/dia) em vez
// de um mapa único no doc do grupo — evita contenção de escrita quando vários
// membros do grupo salvam ao mesmo tempo, e permite paginar por semana depois.
export const setGroupHighlightShare = async (groupId: string, jogador: any, week: string, dayId: number, texts: string[] | null) => {
  const entryId = `${jogador.id}_${week}_${dayId}`;
  const ref = doc(db, 'groups', groupId, 'highlights', entryId);
  if (!texts || texts.length === 0) {
    await deleteDoc(ref);
    return;
  }
  await setDoc(ref, { userId: jogador.id, week, dayId, texts, updatedAt: serverTimestamp() });
};

export const getGroupHighlights = async (groupId: string, week: string): Promise<any[]> => {
  const snap = await getDocs(query(collection(db, 'groups', groupId, 'highlights'), where('week', '==', week)));
  const list: any[] = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list;
};

// ===== Ofensiva com Amigos (Etapa 7) =====
// Mesmo mecanismo de convite por link da dupla (7 dias, uso único), mas
// permite várias ativas ao mesmo tempo (teto de 10). Não expõe conteúdo —
// só o vínculo; a contagem de dias é calculada ao vivo (computeMutualStreak
// em utils.ts), sem contador salvo nem job agendado para "quebrar".
export const FRIEND_STREAK_MAX = 10;

export const createFriendStreakInvite = async (jogador: any): Promise<string> => {
  if (!jogador.locationId || !jogador.track) throw new Error('Complete seu cadastro (local e trilha) antes de convidar.');
  const inviteId = randomId();
  await setDoc(doc(db, 'friendStreakInvites', inviteId), {
    createdBy: jogador.id,
    createdByName: jogador.nome || '',
    createdByAvatar: jogador.avatar || '',
    locationId: jogador.locationId,
    track: jogador.track,
    status: 'pending',
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + PAIR_INVITE_TTL_MS),
  });
  return inviteId;
};

export const getFriendStreakInvite = async (inviteId: string): Promise<any | null> => {
  const snap = await getDoc(doc(db, 'friendStreakInvites', inviteId));
  return snap.exists() ? { id: inviteId, ...snap.data() } : null;
};

// Streaks ativas de um usuário (array-contains puro, sem índice composto)
export const getMyFriendStreaks = async (userId: string): Promise<any[]> => {
  const snap = await getDocs(query(collection(db, 'friendStreaks'), where('members', 'array-contains', userId)));
  const list: any[] = [];
  snap.forEach(d => { const data = d.data(); if (data.active) list.push({ id: d.id, ...data }); });
  return list;
};

export type AcceptFriendStreakResult =
  | { ok: true; streakId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'self' | 'mismatch' | 'limit_reached' | 'error' };

export const acceptFriendStreakInvite = async (inviteId: string, jogador: any): Promise<AcceptFriendStreakResult> => {
  try {
    const inv = await getFriendStreakInvite(inviteId);
    if (!inv || inv.status !== 'pending') return { ok: false, reason: 'not_found' };
    const expMs = inv.expiresAt?.toMillis ? inv.expiresAt.toMillis() : 0;
    if (expMs && expMs < Date.now()) return { ok: false, reason: 'expired' };
    if (inv.createdBy === jogador.id) return { ok: false, reason: 'self' };
    if (inv.locationId !== jogador.locationId || inv.track !== jogador.track) return { ok: false, reason: 'mismatch' };
    // Só dá pra checar o PRÓPRIO teto aqui — a regra do Firestore não deixa
    // consultar as ofensivas de outro usuário (mesma razão do getActivePair).
    const mine = await getMyFriendStreaks(jogador.id);
    if (mine.length >= FRIEND_STREAK_MAX) return { ok: false, reason: 'limit_reached' };

    const batch = writeBatch(db);
    batch.set(doc(db, 'friendStreaks', inviteId), {
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
      active: true,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'friendStreakInvites', inviteId), { status: 'accepted' });
    await batch.commit();
    return { ok: true, streakId: inviteId };
  } catch (e) {
    console.error('acceptFriendStreakInvite', e);
    return { ok: false, reason: 'error' };
  }
};

export const endFriendStreak = async (streakId: string) => {
  await setDoc(doc(db, 'friendStreaks', streakId), { active: false }, { merge: true });
};

export const getWeeklyRanking = async (week: string) => {
  const [snap, adminIds] = await Promise.all([
    getDocs(query(collection(db, 'progress'), where('week', '==', week))),
    getAdminIds(),
  ]);
  // Um usuário pode ter mais de um doc na mesma semana (uma por trilha, caso
  // de admin/professor com acesso a mais de uma trilha) — soma num único
  // lugar no ranking em vez de duplicar a linha.
  const byUser: Record<string, any> = {};
  snap.forEach(doc => {
    const data = doc.data();
    if (isRankingHidden(data.nome)) return;
    if (data.isGuest) return;
    const dias = data.done?.length || 0;
    const existing = byUser[data.userId];
    if (existing) {
      existing.xp += (data.xp || 0);
      existing.dias += dias;
    } else {
      byUser[data.userId] = { id: data.userId, ...data, dias, isAdmin: data.isAdmin || adminIds.has(data.userId), isProfessor: !!data.isProfessor };
    }
  });
  const results = Object.values(byUser);
  return results.sort((a: any, b: any) => b.xp - a.xp);
};

export const getSeasonRanking = async (trimestre: string) => {
  const [snap, adminIds] = await Promise.all([
    getDocs(query(collection(db, 'progress'), where('trimestre', '==', trimestre))),
    getAdminIds(),
  ]);
  const userTotals: Record<string, any> = {};
  snap.forEach(doc => {
    const data = doc.data();
    const uid = data.userId;
    if (isRankingHidden(data.nome)) return;
    if (data.isGuest) return;
    if (!userTotals[uid]) {
      userTotals[uid] = { id: uid, nome: data.nome, avatar: data.avatar, xp: 0, dias: 0, isAdmin: data.isAdmin || adminIds.has(uid), isProfessor: !!data.isProfessor };
    }
    userTotals[uid].xp += (data.xp || 0);
    userTotals[uid].dias += (data.done?.length || 0);
  });
  return Object.values(userTotals).sort((a, b) => b.xp - a.xp);
};

// ===== Ranking por local, pré-calculado (Etapa 6) =====
// Lê os docs prontos escritos pela Netlify function recompute-rankings.
// PRECISA bater EXATAMENTE com o slug() da função (mesma regra de caracteres).
const rankingSlug = (s: string) => (s || 'sem-temporada').replace(/[^A-Za-z0-9]+/g, '_');

export type LocationRankingDoc = {
  locationId: string;
  track: string;
  trimestre: string;
  entries: any[];
  count: number;
  updatedAt?: any;
} | null;

// track === 'general' → ranking geral do local (todas as trilhas juntas)
export const getLocationRanking = async (locationId: string, track: string, trimestre: string): Promise<LocationRankingDoc> => {
  if (!locationId) return null;
  const id = `${locationId}__${track}__${rankingSlug(trimestre)}`;
  try {
    const snap = await getDoc(doc(db, 'rankings', id));
    return snap.exists() ? (snap.data() as any) : null;
  } catch {
    return null;
  }
};

// Ofensiva real de todos os usuários da temporada (para o painel Admin/Professor)
export const getAllUsersStreaks = async (trimestre: string): Promise<Record<string, { nome: string; avatar: string; streak: number; isAdmin: boolean; isProfessor: boolean }>> => {
  const snap = await getDocs(query(collection(db, 'progress'), where('trimestre', '==', trimestre)));
  const porUsuario: Record<string, { nome: string; avatar: string; done: Record<string, number[]>; isAdmin?: boolean; isProfessor?: boolean }> = {};
  snap.forEach(doc => {
    const d = doc.data();
    if (!porUsuario[d.userId]) porUsuario[d.userId] = { nome: d.nome, avatar: d.avatar, done: {}, isAdmin: d.isAdmin, isProfessor: d.isProfessor };
    porUsuario[d.userId].done[d.week] = d.done || [];
  });
  const resultado: Record<string, any> = {};
  for (const uid of Object.keys(porUsuario)) {
    const u = porUsuario[uid];
    resultado[uid] = { nome: u.nome, avatar: u.avatar, isAdmin: !!u.isAdmin, isProfessor: !!u.isProfessor, streak: computeRealStreak(u.done, LICOES) };
  }
  return resultado;
};
