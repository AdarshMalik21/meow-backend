import { Router } from 'express';
import { RideStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { resolveCity } from '../constants';
import {
  formatRideDate,
  isHourSlotTooSoon,
  isRideDateTimePast,
  normalizeRideDate,
} from '../dates';
import { expandCityForSearch } from '../services/cityDirectory';
import { riderMatchesRide, validatePickupStops } from '../services/routeCorridors';
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
      pickupStops: z.array(z.string().min(2).max(80)).optional(),
      totalSeats: z.number().int().min(1).max(7),
    });
    const body = schema.parse(req.body);

    const fromCity = resolveCity(body.fromCity);
    const toCity = resolveCity(body.toCity);

    if (!fromCity || !toCity) {
      return res.status(400).json({ error: 'Pick a valid city from the list.' });
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

    const stopResult = validatePickupStops(
      fromCity,
      toCity,
      body.pickupStops ?? []
    );
    if (!stopResult.ok) {
      return res.status(400).json({ error: stopResult.error });
    }

    const ride = await prisma.ride.create({
      data: {
        driverId: req.user!.userId,
        fromCity,
        toCity,
        date: normalizeRideDate(body.date),
        time: body.time,
        pickupPoint: body.pickupPoint?.trim() ?? '',
        pickupStops: stopResult.pickupStops,
        corridorId: stopResult.corridorId,
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

    const fromCity = resolveCity(query.fromCity);
    const toCity = resolveCity(query.toCity);

    if (!fromCity || !toCity) {
      return res.status(400).json({ error: 'Pick a valid city from the list.' });
    }

    const fromVariants = expandCityForSearch(fromCity);
    const toVariants = expandCityForSearch(toCity);

    const candidates = await prisma.ride.findMany({
      where: {
        date: normalizeRideDate(query.date),
        status: RideStatus.ACTIVE,
        seatsAvailable: { gt: 0 },
        toCity: { in: toVariants, mode: 'insensitive' },
        OR: [
          { fromCity: { in: fromVariants, mode: 'insensitive' } },
          { pickupStops: { hasSome: fromVariants } },
        ],
      },
      include: {
        driver: { include: { driverProfile: true } },
      },
      orderBy: { time: 'asc' },
    });

    const rides = candidates
      .map((r) => {
        const matchType = riderMatchesRide(r, fromCity, toCity);
        if (!matchType) return null;
        return serializeRide(r, { hidePhone: true, matchType });
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return res.json({ rides });
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
          riderFromCity: b.riderFromCity,
          riderToCity: b.riderToCity,
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

    const bodySchema = z.object({
      riderFromCity: z.string().min(2).max(80).optional(),
      riderToCity: z.string().min(2).max(80).optional(),
    });
    const body = bodySchema.parse(req.body ?? {});

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

      const riderFrom = body.riderFromCity ? resolveCity(body.riderFromCity) : null;
      const riderTo = body.riderToCity ? resolveCity(body.riderToCity) : null;

      if (body.riderFromCity && !riderFrom) {
        return { error: 'Pick a valid pickup city from the list.', status: 400 as const };
      }
      if (body.riderToCity && !riderTo) {
        return { error: 'Pick a valid destination city from the list.', status: 400 as const };
      }

      if (riderFrom && riderTo) {
        const matchType = riderMatchesRide(ride, riderFrom, riderTo);
        if (!matchType) {
          return {
            error: 'This ride does not match your route.',
            status: 400 as const,
          };
        }
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
        data: {
          rideId,
          riderId,
          status: 'PENDING',
          riderFromCity: riderFrom ?? '',
          riderToCity: riderTo ?? '',
        },
      });

      return { booking, ride, riderFrom, riderTo };
    });

    if ('error' in result && result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { booking, ride, riderFrom, riderTo } = result as {
      booking: { id: string; status: string };
      ride: Parameters<typeof serializeRide>[0] & {
        driver: { expoPushToken?: string | null; name: string | null };
      };
      riderFrom: string | null;
      riderTo: string | null;
    };

    const driverPushToken = ride.driver.expoPushToken;
    if (driverPushToken) {
      const segment =
        riderFrom && riderTo
          ? `${riderFrom} → ${riderTo}`
          : 'a seat on your ride';
      await sendExpoPush([
        {
          to: driverPushToken,
          title: 'New seat request',
          body: `Rider wants ${segment}. Open My Rides to Allow or Decline.`,
          data: { rideId: ride.id, bookingId: booking.id },
        },
      ]);
    }

    return res.status(201).json({
      booking: {
        id: booking.id,
        status: 'PENDING',
        riderFromCity: riderFrom ?? '',
        riderToCity: riderTo ?? '',
        ride: serializeRide(ride, { hidePhone: true }),
      },
      message: 'Request sent. Waiting for driver.',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid booking request.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Could not send request. Try again.' });
  }
});

type SerializeOpts = {
  hidePhone?: boolean;
  matchType?: 'exact' | 'viaStop';
};

function serializeRide(
  ride: {
    id: string;
    fromCity: string;
    toCity: string;
    date: string;
    time: string;
    pickupPoint: string;
    pickupStops?: string[];
    corridorId?: string | null;
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
  opts: SerializeOpts = {}
) {
  const hidePhone = opts.hidePhone ?? false;
  const date = formatRideDate(ride.date);

  return {
    id: ride.id,
    fromCity: ride.fromCity,
    toCity: ride.toCity,
    date,
    time: ride.time,
    pickupPoint: ride.pickupPoint,
    pickupStops: ride.pickupStops ?? [],
    matchType: opts.matchType,
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
