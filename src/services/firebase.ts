import admin from 'firebase-admin';
import fs from 'fs';

let initialized = false;
let projectId: string | null = null;
let credentialSource: string | null = null;

function loadServiceAccountJson(): Record<string, unknown> | null {
  const rawB64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64?.trim();
  if (rawB64) {
    try {
      const decoded = Buffer.from(rawB64, 'base64').toString('utf8');
      const json = JSON.parse(decoded) as Record<string, unknown>;
      credentialSource = 'FIREBASE_SERVICE_ACCOUNT_B64';
      return json;
    } catch (err) {
      console.warn('Firebase B64 decode failed:', err);
    }
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    try {
      const json = JSON.parse(raw) as Record<string, unknown>;
      credentialSource = 'FIREBASE_SERVICE_ACCOUNT_JSON';
      return json;
    } catch {
      try {
        const fixed = raw
          .replace(/-----BEGIN PRIVATE KEY-----\\n/g, '-----BEGIN PRIVATE KEY-----\n')
          .replace(/\\n-----END PRIVATE KEY-----\\n/g, '\n-----END PRIVATE KEY-----\n');
        const json = JSON.parse(fixed) as Record<string, unknown>;
        credentialSource = 'FIREBASE_SERVICE_ACCOUNT_JSON';
        return json;
      } catch (err) {
        console.warn('Firebase JSON parse failed:', err);
      }
    }
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credPath && fs.existsSync(credPath)) {
    try {
      const json = JSON.parse(fs.readFileSync(credPath, 'utf8')) as Record<string, unknown>;
      credentialSource = 'GOOGLE_APPLICATION_CREDENTIALS';
      return json;
    } catch (err) {
      console.warn('Firebase file read failed:', err);
    }
  }

  return null;
}

export function initFirebaseAdmin(): boolean {
  if (initialized) return true;

  try {
    const json = loadServiceAccountJson();
    if (!json) {
      console.warn(
        'Firebase Admin: no credentials. Set FIREBASE_SERVICE_ACCOUNT_B64 on Render.'
      );
      return false;
    }

    if (typeof json.project_id !== 'string' || typeof json.private_key !== 'string') {
      console.warn('Firebase Admin: service account JSON missing project_id or private_key');
      return false;
    }

    admin.initializeApp({
      credential: admin.credential.cert(json as admin.ServiceAccount),
      projectId: json.project_id,
    });
    projectId = json.project_id;
    initialized = true;
    console.log(`Firebase Admin ready (project: ${projectId}, source: ${credentialSource})`);
    return true;
  } catch (err) {
    console.warn('Firebase Admin init failed:', err);
  }

  return false;
}

export function getFirebaseStatus() {
  const ready = isFirebaseReady();
  return {
    ready,
    projectId: getFirebaseProjectId(),
    credentialSource,
    hasB64: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_B64?.trim()),
    hasJson: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()),
    hasCredPath: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()),
  };
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
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: string }).message)
      : '';

  console.error('verifyIdToken error:', code || 'no-code', message);

  switch (code) {
    case 'auth/id-token-expired':
      return 'OTP session expired. Send OTP again and verify quickly.';
    case 'auth/argument-error':
      return 'Invalid login token. Send OTP again.';
    case 'auth/invalid-credential':
      return 'Server Firebase credentials are invalid. Contact support.';
    default:
      if (process.env.ALLOW_DEV_AUTH === 'true' && code) {
        return `Could not verify phone login (${code}). Try Dev login or fix Firebase on server.`;
      }
      return 'Could not verify phone login. Try again.';
  }
}
