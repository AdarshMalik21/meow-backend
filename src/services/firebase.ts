import admin from 'firebase-admin';

let initialized = false;

export function initFirebaseAdmin(): boolean {
  if (initialized) return true;

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const json = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(json),
      });
      initialized = true;
      return true;
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      initialized = true;
      return true;
    }
  } catch (err) {
    console.warn('Firebase Admin init failed:', err);
  }

  return false;
}

export function isFirebaseReady(): boolean {
  return initialized || initFirebaseAdmin();
}

export async function verifyFirebaseIdToken(idToken: string) {
  if (!isFirebaseReady()) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  return admin.auth().verifyIdToken(idToken);
}
