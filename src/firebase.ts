import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, query, where, orderBy, limit, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { isRankingHidden } from './utils';
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

export const saveProgress = async (prog: any, week: string, userId: string, nome: string, avatar: string, trimestre: string, isAdmin?: boolean) => {
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
    updatedAt: serverTimestamp()
  }, { merge: true });
};

export const getProgress = async (userId: string, week: string) => {
  const progId = `${userId}_${week}`;
  const progRef = doc(db, 'progress', progId);
  const snap = await getDoc(progRef);
  return snap.exists() ? snap.data() : null;
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
    results.push({ id: data.userId, ...data, dias: data.done?.length || 0, isAdmin: data.isAdmin || adminIds.has(data.userId) });
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
    if (!userTotals[uid]) {
      userTotals[uid] = { id: uid, nome: data.nome, avatar: data.avatar, xp: 0, dias: 0, isAdmin: data.isAdmin || adminIds.has(uid) };
    }
    userTotals[uid].xp += (data.xp || 0);
    userTotals[uid].dias += (data.done?.length || 0);
  });
  return Object.values(userTotals).sort((a, b) => b.xp - a.xp);
};
