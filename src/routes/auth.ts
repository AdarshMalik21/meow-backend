import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { AuthedRequest, requireAuth, signToken } from '../middleware/auth';
import { verifyFirebaseIdToken, isFirebaseReady, mapFirebaseVerifyError } from '../services/firebase';

const router = Router();

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (phone.startsWith('+') && digits.length >= 10) return `+${digits}`;
  return phone.trim();
}

async function upsertUserAndToken(params: {
  phone: string;
  firebaseUid?: string;
}) {
  const phone = normalizePhone(params.phone);
  const user = await prisma.user.upsert({
    where: { phone },
    create: {
      phone,
      firebaseUid: params.firebaseUid,
    },
    update: {
      firebaseUid: params.firebaseUid ?? undefined,
    },
    include: { driverProfile: true },
  });

  const token = signToken({ userId: user.id, phone: user.phone });
  return { token, user };
}

/** Exchange Firebase ID token for app JWT. */
router.post('/firebase', async (req, res) => {
  try {
    const schema = z.object({ idToken: z.string().min(10) });
    const { idToken } = schema.parse(req.body);

    if (!isFirebaseReady()) {
      return res.status(503).json({
        error:
          'Phone login is not set up yet on the server. Use Dev Login for now, or add Firebase Admin credentials.',
      });
    }

    const decoded = await verifyFirebaseIdToken(idToken);
    const phone = decoded.phone_number;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number missing from Firebase login.' });
    }

    const result = await upsertUserAndToken({
      phone,
      firebaseUid: decoded.uid,
    });

    return res.json({
      token: result.token,
      user: serializeUser(result.user),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid login request.' });
    }
    console.error('Firebase login failed:', err);
    return res.status(401).json({ error: mapFirebaseVerifyError(err) });
  }
});

/**
 * Local-only login without Firebase.
 * Enabled when ALLOW_DEV_AUTH=true.
 */
router.post('/dev-login', async (req, res) => {
  try {
    if (process.env.ALLOW_DEV_AUTH !== 'true') {
      return res.status(403).json({ error: 'Dev login is turned off.' });
    }

    const schema = z.object({
      phone: z.string().min(10),
      name: z.string().optional(),
    });
    const { phone, name } = schema.parse(req.body);
    const normalized = normalizePhone(phone);

    const existing = await prisma.user.findUnique({ where: { phone: normalized } });
    const user = await prisma.user.upsert({
      where: { phone: normalized },
      create: {
        phone: normalized,
        name: name?.trim() || null,
      },
      update: name?.trim()
        ? { name: name.trim() }
        : {},
      include: { driverProfile: true },
    });

    // Keep name if first create with name, or leave existing
    if (!existing && !user.name && name?.trim()) {
      // already set in create
    }

    const token = signToken({ userId: user.id, phone: user.phone });
    return res.json({ token, user: serializeUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Enter a valid 10-digit phone number.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Could not log you in. Try again.' });
  }
});

router.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { driverProfile: true },
  });
  if (!user) {
    return res.status(401).json({ error: 'Please log in again.' });
  }
  return res.json({ user: serializeUser(user) });
});

router.patch('/me', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().min(2).max(80).optional(),
      expoPushToken: z.string().nullable().optional(),
    });
    const data = schema.parse(req.body);

    if (!data.name && data.expoPushToken === undefined) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.expoPushToken !== undefined
          ? { expoPushToken: data.expoPushToken }
          : {}),
      },
      include: { driverProfile: true },
    });

    return res.json({ user: serializeUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Enter a valid name (at least 2 letters).' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Could not save your profile. Try again.' });
  }
});

function serializeUser(user: {
  id: string;
  phone: string;
  name: string | null;
  expoPushToken: string | null;
  createdAt: Date;
  driverProfile: { carModel: string; carNumber: string } | null;
}) {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    hasDriverProfile: Boolean(user.driverProfile),
    driverProfile: user.driverProfile
      ? {
          carModel: user.driverProfile.carModel,
          carNumber: user.driverProfile.carNumber,
        }
      : null,
    needsName: !user.name,
    createdAt: user.createdAt,
  };
}

export default router;
