import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, query, where, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
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


export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Error signing in with Google', error);
    throw error;
  }
};

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
  await setDoc(userRef, {
    ...userProfile,
    criadoEm: userProfile.criadoEm || new Date().toISOString()
  }, { merge: true });
};

export const getUser = async (userId: string) => {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  return snap.exists() ? snap.data() : null;
};

export const saveProgress = async (prog: any, week: string, userId: string, nome: string, avatar: string) => {
  const progId = `${userId}_${week}`;
  const progRef = doc(db, 'progress', progId);
  await setDoc(progRef, {
    userId,
    week,
    xp: prog.xp,
    streak: prog.streak,
    done: prog.done,
    history: prog.history,
    nome,
    avatar,
    updatedAt: serverTimestamp()
  });
};

export const getProgress = async (userId: string, week: string) => {
  const progId = `${userId}_${week}`;
  const progRef = doc(db, 'progress', progId);
  const snap = await getDoc(progRef);
  return snap.exists() ? snap.data() : null;
};

export const getWeeklyRanking = async (week: string) => {
  const progressCol = collection(db, 'progress');
  const q = query(
    progressCol, 
    where('week', '==', week)
  );
  const snap = await getDocs(q);
  const results: any[] = [];
  snap.forEach(doc => {
    results.push({ id: doc.data().userId, ...doc.data() });
  });
  // Sort descending by XP locally, since we only query by week to save index requirements
  return results.sort((a, b) => b.xp - a.xp);
};
