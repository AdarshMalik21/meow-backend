import { Router } from 'express';
import { RideStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { isValidCity, trimCity } from '../constants';
import { isHourSlotTooSoon, isRideDateTimePast } from '../dates';
import { sendExpoPush } from '../services/push';

const router = Router();

router.post('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const schema = z.object({
      fromCity: z.string().min(2).max(80),
      toCity: z.string().min(2).max(80),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().regex(/^\d{2}:\d{2}$/),
      pickupPoint: z.string().max(120).optional(),
      totalSeats: z.number().int().min(1).max(7),
    });
    const body = schema.parse(req.body);

    const fromCity = trimCity(body.fromCity);
    const toCity = trimCity(body.toCity);

    if (!isValidCity(fromCity) || !isValidCity(toCity)) {
      return res.status(400).json({ error: 'Enter valid from and to cities.' });
    }
    if (fromCity.toLowerCase() === toCity.toLowerCase()) {
      return res.status(400).json({ error: 'From and To must be different cities.' });
    }

    if (isRideDateTimePast(body.date, body.time)) {
      return res.status(400).json({ error: 'Cannot post a ride in the past.' });
    }

    if (isHourSlotTooSoon(body.date, body.time)) {
      return res.status(400).json({
        error: 'Cannot post a ride in the current hour. Pick a later time slot.',
      });
    }

    const profile = await prisma.driverProfile.findUnique({
      where: { userId: req.user!.userId },
    });
    if (!profile) {
      return res.status(400).json({
        error: 'Add your car details before posting a ride.',
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user?.name) {
      return res.status(400).json({ error: 'Add your name before posting a ride.' });
    }

    const ride = await prisma.ride.create({
      data: {
        driverId: req.user!.userId,
        fromCity,
        toCity,
        date: new Date(body.date + 'T00:00:00.000Z'),
        time: body.time,
        pickupPoint: body.pickupPoint?.trim() ?? '',
        totalSeats: body.totalSeats,
        seatsAvailable: body.totalSeats,
        status: RideStatus.ACTIVE,
      },
      include: {
        driver: { include: { driverProfile: true } },
      },
    });

    return res.status(201).json({ ride: serializeRide(ride) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Check ride details and try again.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Could not post ride. Try again.' });
  }
});

router.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const schema = z.object({
      fromCity: z.string().min(2),
      toCity: z.string().min(2),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    });
    const query = schema.parse(req.query);

    const fromCity = trimCity(query.fromCity);
    const toCity = trimCity(query.toCity);

    const rides = await prisma.ride.findMany({
      where: {
        fromCity: { equals: fromCity, mode: 'insensitive' },
        toCity: { equals: toCity, mode: 'insensitive' },
        date: new Date(query.date + 'T00:00:00.000Z'),
        status: RideStatus.ACTIVE,
        seatsAvailable: { gt: 0 },
      },
      include: {
        driver: { include: { driverProfile: true } },
      },
      orderBy: { time: 'asc' },
    });

    return res.json({
      rides: rides.map((r) => serializeRide(r, { hidePhone: true })),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Enter from city, to city, and date.' });
    }
    console.error(err);
    return res.status(500).json({
      error: "Couldn't load rides. Check your internet and try again.",
    });
  }
});

router.get('/mine', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const rides = await prisma.ride.findMany({
      where: { driverId: req.user!.userId },
      include: {
        driver: { include: { driverProfile: true } },
        bookings: {
          where: { status: { in: ['PENDING', 'BOOKED'] } },
          include: { rider: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
    });

    return res.json({
      rides: rides.map((r) => ({
        ...serializeRide(r),
        bookingsCount: r.bookings.filter((b) => b.status === 'BOOKED').length,
        pendingCount: r.bookings.filter((b) => b.status === 'PENDING').length,
        requests: r.bookings.map((b) => ({
          id: b.id,
          status: b.status,
          createdAt: b.createdAt,
          rider: {
            id: b.rider.id,
            name: b.rider.name,
            phone: b.rider.phone,
          },
        })),
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Couldn't load your rides. Check your internet and try again.",
    });
  }
});

router.patch('/:id/status', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const schema = z.object({
      status: z.enum(['FULL', 'CANCELLED', 'COMPLETED', 'ACTIVE']),
    });
    const { status } = schema.parse(req.body);

    const ride = await prisma.ride.findUnique({ where: { id: req.params.id } });
    if (!ride || ride.driverId !== req.user!.userId) {
      return res.status(404).json({ error: 'Ride not found.' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (status === 'CANCELLED') {
        await tx.booking.updateMany({
          where: { rideId: ride.id, status: { in: ['BOOKED', 'PENDING'] } },
          data: { status: 'CANCELLED' },
        });
      }

      return tx.ride.update({
        where: { id: ride.id },
        data: { status: status as RideStatus },
        include: {
          driver: { include: { driverProfile: true } },
        },
      });
    });

    if (status === 'CANCELLED') {
      const cancelledBookings = await prisma.booking.findMany({
        where: { rideId: ride.id, status: 'CANCELLED' },
        include: { rider: true },
      });
      await sendExpoPush(
        cancelledBookings
          .filter((b) => b.rider.expoPushToken)
          .map((b) => ({
            to: b.rider.expoPushToken!,
            title: 'Ride cancelled',
            body: 'The driver cancelled this ride.',
            data: { rideId: ride.id },
          }))
      );
    }

    return res.json({ ride: serializeRide(updated) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid ride status.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Could not update ride. Try again.' });
  }
});

router.post('/:id/book', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const rideId = req.params.id;
    const riderId = req.user!.userId;

    const result = await prisma.$transaction(async (tx) => {
      const ride = await tx.ride.findUnique({
        where: { id: rideId },
        include: {
          driver: { include: { driverProfile: true } },
        },
      });

      if (!ride) {
        return { error: 'Ride not found.', status: 404 as const };
      }
      if (ride.driverId === riderId) {
        return { error: 'You cannot book your own ride.', status: 400 as const };
      }
      if (ride.status !== 'ACTIVE' || ride.seatsAvailable < 1) {
        return { error: 'No seats left on this ride.', status: 409 as const };
      }

      const existing = await tx.booking.findFirst({
        where: {
          rideId,
          riderId,
          status: { in: ['PENDING', 'BOOKED'] },
        },
      });
      if (existing) {
        return {
          error:
            existing.status === 'PENDING'
              ? 'You already requested this ride. Wait for the driver.'
              : 'You already booked this ride.',
          status: 409 as const,
        };
      }

      const booking = await tx.booking.create({
        data: { rideId, riderId, status: 'PENDING' },
      });

      return { booking, ride };
    });

    if ('error' in result && result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { booking, ride } = result as {
      booking: { id: string; status: string };
      ride: Parameters<typeof serializeRide>[0] & {
        driver: { expoPushToken?: string | null; name: string | null };
      };
    };

    const driverPushToken = ride.driver.expoPushToken;
    if (driverPushToken) {
      await sendExpoPush([
        {
          to: driverPushToken,
          title: 'New seat request',
          body: 'A rider asked for a seat. Open My Rides to Allow or Decline.',
          data: { rideId: ride.id, bookingId: booking.id },
        },
      ]);
    }

    return res.status(201).json({
      booking: {
        id: booking.id,
        status: 'PENDING',
        ride: serializeRide(ride, { hidePhone: true }),
      },
      message: 'Request sent. Waiting for driver.',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not send request. Try again.' });
  }
});

function serializeRide(
  ride: {
    id: string;
    fromCity: string;
    toCity: string;
    date: Date;
    time: string;
    pickupPoint: string;
    totalSeats: number;
    seatsAvailable: number;
    status: RideStatus;
    driver: {
      id: string;
      name: string | null;
      phone: string;
      expoPushToken?: string | null;
      driverProfile: { carModel: string; carNumber: string } | null;
    };
  },
  opts: { hidePhone?: boolean } = {}
) {
  const hidePhone = opts.hidePhone ?? false;
  const date =
    ride.date instanceof Date
      ? ride.date.toISOString().slice(0, 10)
      : String(ride.date).slice(0, 10);

  return {
    id: ride.id,
    fromCity: ride.fromCity,
    toCity: ride.toCity,
    date,
    time: ride.time,
    pickupPoint: ride.pickupPoint,
    totalSeats: ride.totalSeats,
    seatsAvailable: ride.seatsAvailable,
    status: ride.status,
    driver: {
      id: ride.driver.id,
      name: ride.driver.name,
      phone: hidePhone ? undefined : ride.driver.phone,
      carModel: ride.driver.driverProfile?.carModel ?? '',
      carNumber: hidePhone
        ? undefined
        : ride.driver.driverProfile?.carNumber ?? '',
    },
  };
}

export default router;
