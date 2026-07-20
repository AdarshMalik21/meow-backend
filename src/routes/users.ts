import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

router.put('/driver-profile', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const schema = z.object({
      carModel: z.string().min(2).max(60),
      carNumber: z.string().min(4).max(20),
    });
    const { carModel, carNumber } = schema.parse(req.body);

    const profile = await prisma.driverProfile.upsert({
      where: { userId: req.user!.userId },
      create: {
        userId: req.user!.userId,
        carModel: carModel.trim(),
        carNumber: carNumber.trim().toUpperCase(),
      },
      update: {
        carModel: carModel.trim(),
        carNumber: carNumber.trim().toUpperCase(),
      },
    });

    return res.json({
      driverProfile: {
        carModel: profile.carModel,
        carNumber: profile.carNumber,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Enter car model and car number.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Could not save car details. Try again.' });
  }
});

export default router;
