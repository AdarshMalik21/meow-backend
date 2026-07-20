import admin from 'firebase-admin';

let initialized = false;
let projectId: string | null = null;

function loadServiceAccountJson(): Record<string, unknown> | null {
  const rawB64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64?.trim();
  if (rawB64) {
    try {
      const decoded = Buffer.from(rawB64, 'base64').toString('utf8');
      return JSON.parse(decoded) as Record<string, unknown>;
    } catch (err) {
      console.warn('Firebase B64 decode failed:', err);
    }
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Render paste sometimes breaks escaped newlines in private_key
    try {
      const fixed = raw.replace(
        /-----BEGIN PRIVATE KEY-----\\n/g,
        '-----BEGIN PRIVATE KEY-----\n'
      ).replace(/\\n-----END PRIVATE KEY-----\\n/g, '\n-----END PRIVATE KEY-----\n');
      return JSON.parse(fixed) as Record<string, unknown>;
    } catch (err) {
      console.warn('Firebase JSON parse failed:', err);
      return null;
    }
  }
}

export function initFirebaseAdmin(): boolean {
  if (initialized) return true;

  try {
    const json = loadServiceAccountJson();
    if (json) {
      admin.initializeApp({
        credential: admin.credential.cert(json as admin.ServiceAccount),
      });
      projectId =
        typeof json.project_id === 'string' ? json.project_id : null;
      initialized = true;
      return true;
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      projectId = admin.app().options.projectId ?? null;
      initialized = true;
      return true;
    }
  } catch (err) {
    console.warn('Firebase Admin init failed:', err);
  }

  return false;
}

export function getFirebaseProjectId(): string | null {
  if (!initialized) initFirebaseAdmin();
  return projectId;
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

export function mapFirebaseVerifyError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: string }).code)
      : '';
  switch (code) {
    case 'auth/id-token-expired':
      return 'OTP session expired. Send OTP again and verify quickly.';
    case 'auth/argument-error':
      return 'Invalid login token. Send OTP again.';
    default:
      return 'Could not verify phone login. Try again.';
  }
}
