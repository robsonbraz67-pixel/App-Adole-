import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, getDocs, query, where, orderBy, limit, serverTimestamp, onSnapshot } from 'firebase/firestore';
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

export const saveProgress = async (prog: any, week: string, userId: string, nome: string, avatar: string, trimestre: string, isAdmin?: boolean, isGuest?: boolean, isProfessor?: boolean) => {
  const progId = `${userId}_${week}`;
  const progRef = doc(db, 'progress', progId);
  await setDoc(progRef, {
    userId,
    week,
    trimestre,
    xp: prog.xp,
    streak: prog.streak,
    done: prog.done,
    history: prog.history,
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

export const getProgress = async (userId: string, week: string) => {
  const progId = `${userId}_${week}`;
  const progRef = doc(db, 'progress', progId);
  const snap = await getDoc(progRef);
  return snap.exists() ? snap.data() : null;
};

// Mapa { semana: [diaIds concluídos] } de todas as semanas do usuário —
// usado para marcar dias já feitos em semanas anteriores na trilha
export const getUserAllDone = async (userId: string): Promise<Record<string, number[]>> => {
  const snap = await getDocs(query(collection(db, 'progress'), where('userId', '==', userId)));
  const map: Record<string, number[]> = {};
  snap.forEach(doc => {
    const data = doc.data();
    map[data.week] = data.done || [];
  });
  return map;
};

export const getDayOverride = async (semana: string, diaId: number) => {
  const ref = doc(db, 'conteudoOverrides', `${semana}_${diaId}`);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
};

export const saveDayOverride = async (semana: string, diaId: number, data: any) => {
  const ref = doc(db, 'conteudoOverrides', `${semana}_${diaId}`);
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
};

export const getWeeklyRanking = async (week: string) => {
  const [snap, adminIds] = await Promise.all([
    getDocs(query(collection(db, 'progress'), where('week', '==', week))),
    getAdminIds(),
  ]);
  const results: any[] = [];
  snap.forEach(doc => {
    const data = doc.data();
    if (isRankingHidden(data.nome)) return;
    if (data.isGuest) return;
    results.push({ id: data.userId, ...data, dias: data.done?.length || 0, isAdmin: data.isAdmin || adminIds.has(data.userId), isProfessor: !!data.isProfessor });
  });
  return results.sort((a, b) => b.xp - a.xp);
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
