import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User, type Auth } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, query, where, serverTimestamp, onSnapshot, type Firestore } from 'firebase/firestore';

type RuntimeFirebaseConfig = FirebaseOptions & {
  firestoreDatabaseId?: string;
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let configPromise: Promise<RuntimeFirebaseConfig> | null = null;
const googleProvider = new GoogleAuthProvider();

const getFirebaseConfig = async () => {
  if (!configPromise) {
    configPromise = fetch('/api/firebase-config').then(async (response) => {
      if (!response.ok) {
        throw new Error('Firebase configuration is unavailable');
      }
      return response.json() as Promise<RuntimeFirebaseConfig>;
    });
  }
  return configPromise;
};

const getFirebaseServices = async () => {
  if (!app || !db || !auth) {
    const firebaseConfig = await getFirebaseConfig();
    app = initializeApp(firebaseConfig);
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    auth = getAuth(app);
  }

  return { db, auth };
};

let authInitialized = false;
let authPromise: Promise<User | null> | null = null;

export const waitForAuthInit = async () => {
  const { auth } = await getFirebaseServices();
  if (authInitialized) return auth.currentUser;
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


export const signInWithGoogle = async () => {
  const { auth } = await getFirebaseServices();
  return signInWithPopup(auth, googleProvider);
};

export const logout = async () => {
  try {
    const { auth } = await getFirebaseServices();
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out', error);
    throw error;
  }
};

export const saveUser = async (userProfile: any) => {
  const { db } = await getFirebaseServices();
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
  const { db } = await getFirebaseServices();
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
  const { db } = await getFirebaseServices();
  const usersCol = collection(db, 'users');
  const snap = await getDocs(usersCol);
  const users: any[] = [];
  snap.forEach(doc => {
    users.push({ id: doc.id, ...doc.data() });
  });
  return users;
};

export const toggleAdmin = async (userId: string, targetValue: boolean) => {
  const { db } = await getFirebaseServices();
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, { isAdmin: targetValue }, { merge: true });
};

export const getAdminIds = async (): Promise<Set<string>> => {
  const { db } = await getFirebaseServices();
  const q = query(collection(db, 'users'), where('isAdmin', '==', true));
  const snap = await getDocs(q);
  const ids = new Set<string>();
  snap.forEach(d => ids.add(d.id));
  return ids;
};

export const sendManualNotification = async (userIds: string[], title: string, body: string) => {
  const { db } = await getFirebaseServices();
  const now = new Date().getTime();
  for (const uid of userIds) {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, { manualNotification: { title, body, timestamp: now } }, { merge: true });
  }
};

export const listenToUserNotifications = (userId: string, callback: (notification: any) => void) => {
  let unsubscribe: (() => void) | null = null;
  let active = true;

  getFirebaseServices().then(({ db }) => {
    if (!active) return;
    const userRef = doc(db, 'users', userId);
    unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.manualNotification) {
          callback(data.manualNotification);
        }
      }
    });
  }).catch(console.error);

  return () => {
    active = false;
    unsubscribe?.();
  };
};

export const saveProgress = async (prog: any, week: string, userId: string, nome: string, avatar: string, trimestre: string, isAdmin?: boolean) => {
  const { db } = await getFirebaseServices();
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
  const { db } = await getFirebaseServices();
  const progId = `${userId}_${week}`;
  const progRef = doc(db, 'progress', progId);
  const snap = await getDoc(progRef);
  return snap.exists() ? snap.data() : null;
};

export const getWeeklyRanking = async (week: string) => {
  const { db } = await getFirebaseServices();
  const [snap, adminIds] = await Promise.all([
    getDocs(query(collection(db, 'progress'), where('week', '==', week))),
    getAdminIds(),
  ]);
  const results: any[] = [];
  snap.forEach(doc => {
    const data = doc.data();
    results.push({ id: data.userId, ...data, dias: data.done?.length || 0, isAdmin: adminIds.has(data.userId) });
  });
  return results.sort((a, b) => b.xp - a.xp);
};

export const getSeasonRanking = async (trimestre: string) => {
  const { db } = await getFirebaseServices();
  const [snap, adminIds] = await Promise.all([
    getDocs(query(collection(db, 'progress'), where('trimestre', '==', trimestre))),
    getAdminIds(),
  ]);
  const userTotals: Record<string, any> = {};
  snap.forEach(doc => {
    const data = doc.data();
    const uid = data.userId;
    if (!userTotals[uid]) {
      userTotals[uid] = { id: uid, nome: data.nome, avatar: data.avatar, xp: 0, dias: 0, isAdmin: adminIds.has(uid) };
    }
    userTotals[uid].xp += (data.xp || 0);
    userTotals[uid].dias += (data.done?.length || 0);
  });
  return Object.values(userTotals).sort((a, b) => b.xp - a.xp);
};
