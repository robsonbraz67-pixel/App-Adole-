import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Mesma inicialização usada pelos dois backfills — conta de serviço vinda de
// FIREBASE_SERVICE_ACCOUNT (segredo do GitHub Actions), banco vindo de
// FB_FIRESTORE_DB (mesmo nome de variável que era usado no Netlify).
export const dbAdmin = () => {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? '{}');
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore(process.env.FB_FIRESTORE_DB ?? '(default)');
};
