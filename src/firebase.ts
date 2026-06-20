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

export const saveProgress = async (prog: any, week: string, userId: string, nome: string, avatar: string, trimestre: string) => {
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

export const getSeasonRanking = async (trimestre: string) => {
  const progressCol = collection(db, 'progress');
  const q = query(
    progressCol, 
    where('trimestre', '==', trimestre)
  );
  const snap = await getDocs(q);
  
  const userTotals: Record<string, any> = {};
  
  snap.forEach(doc => {
    const data = doc.data();
    const uid = data.userId;
    if (!userTotals[uid]) {
      userTotals[uid] = {
        id: uid,
        nome: data.nome,
        avatar: data.avatar,
        xp: 0,
        dias: 0 // completed days for the whole season
      };
    }
    
    userTotals[uid].xp += (data.xp || 0);
    userTotals[uid].dias += (data.done?.length || 0);
  });
  
  return Object.values(userTotals).sort((a, b) => b.xp - a.xp);
};
