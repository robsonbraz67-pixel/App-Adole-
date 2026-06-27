const requiredKeys = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_APP_ID',
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
];

export default async () => {
  const missing = requiredKeys.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    return Response.json(
      { error: 'Firebase configuration is incomplete', missing },
      { status: 500 },
    );
  }

  return Response.json({
    projectId: process.env.FIREBASE_PROJECT_ID,
    appId: process.env.FIREBASE_APP_ID,
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || '(default)',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || '',
  });
};

export const config = {
  path: '/api/firebase-config',
  method: 'GET',
};
