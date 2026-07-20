import { Router } from 'express';
import { RideStatus } from '@prisma/client';
import { prisma } from '../prisma';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { sendExpoPush } from '../services/push';

const router = Router();

router.get('/mine', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { riderId: req.user!.userId },
      include: {
        ride: {
          include: {
            driver: { include: { driverProfile: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      bookings: bookings.map((b) => ({
        id: b.id,
        status: b.status,
        createdAt: b.createdAt,
        ride: {
          id: b.ride.id,
          fromCity: b.ride.fromCity,
          toCity: b.ride.toCity,
          date:
            b.ride.date instanceof Date
              ? b.ride.date.toISOString().slice(0, 10)
              : String(b.ride.date).slice(0, 10),
          time: b.ride.time,
          pickupPoint: b.ride.pickupPoint,
          status: b.ride.status,
          seatsAvailable: b.ride.seatsAvailable,
          driver: {
            name: b.ride.driver.name,
            phone: b.status === 'BOOKED' ? b.ride.driver.phone : undefined,
            carModel: b.ride.driver.driverProfile?.carModel ?? '',
            carNumber:
              b.status === 'BOOKED'
                ? b.ride.driver.driverProfile?.carNumber ?? ''
                : undefined,
          },
        },
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Couldn't load bookings. Check your internet and try again.",
    });
  }
});

/** Driver confirms: decrement seat only here. */
router.post('/:id/approve', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const bookingId = req.params.id;

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          ride: {
            include: {
              driver: { include: { driverProfile: true } },
            },
          },
          rider: true,
        },
      });

      if (!booking) {
        return { error: 'Request not found.', status: 404 as const };
      }
      if (booking.ride.driverId !== req.user!.userId) {
        return { error: 'You can only allow requests on your rides.', status: 403 as const };
      }
      if (booking.status !== 'PENDING') {
        return { error: 'This request is no longer waiting.', status: 400 as const };
      }
      if (booking.ride.status !== 'ACTIVE' || booking.ride.seatsAvailable < 1) {
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: 'REJECTED' },
        });
        return { error: 'No seats left on this ride.', status: 409 as const };
      }

      const seatsAvailable = booking.ride.seatsAvailable - 1;
      const rideStatus: RideStatus = seatsAvailable === 0 ? 'FULL' : 'ACTIVE';

      await tx.ride.update({
        where: { id: booking.rideId },
        data: { seatsAvailable, status: rideStatus },
      });

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'BOOKED' },
        include: {
          ride: {
            include: {
              driver: { include: { driverProfile: true } },
            },
          },
          rider: true,
        },
      });

      return { booking: updated };
    });

    if ('error' in result && result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { booking } = result as {
      booking: {
        id: string;
        rider: { expoPushToken: string | null };
        ride: {
          pickupPoint: string;
          time: string;
          driver: { phone: string; name: string | null };
        };
      };
    };

    if (booking.rider.expoPushToken) {
      await sendExpoPush([
        {
          to: booking.rider.expoPushToken,
          title: 'Seat confirmed',
          body: `Driver allowed your request. Pickup: ${booking.ride.pickupPoint} at ${booking.ride.time}`,
          data: { bookingId: booking.id },
        },
      ]);
    }

    return res.json({
      booking: {
        id: booking.id,
        status: 'BOOKED',
        ride: {
          pickupPoint: booking.ride.pickupPoint,
          time: booking.ride.time,
          driver: {
            name: booking.ride.driver.name,
            phone: booking.ride.driver.phone,
          },
        },
      },
      message: 'Request allowed. Seat confirmed.',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not allow request. Try again.' });
  }
});

router.post('/:id/reject', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const bookingId = req.params.id;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { ride: true, rider: true },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Request not found.' });
    }
    if (booking.ride.driverId !== req.user!.userId) {
      return res.status(403).json({ error: 'You can only decline requests on your rides.' });
    }
    if (booking.status !== 'PENDING') {
      return res.status(400).json({ error: 'This request is no longer waiting.' });
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'REJECTED' },
    });

    if (booking.rider.expoPushToken) {
      await sendExpoPush([
        {
          to: booking.rider.expoPushToken,
          title: 'Request declined',
          body: 'The driver declined your seat request.',
          data: { bookingId: booking.id },
        },
      ]);
    }

    return res.json({ ok: true, message: 'Request declined.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not decline request. Try again.' });
  }
});

router.post('/:id/cancel', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const bookingId = req.params.id;

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { ride: true },
      });

      if (!booking || booking.riderId !== req.user!.userId) {
        return { error: 'Booking not found.', status: 404 as const };
      }
      if (booking.status !== 'BOOKED' && booking.status !== 'PENDING') {
        return { error: 'This booking cannot be cancelled.', status: 400 as const };
      }
      if (booking.ride.status === 'COMPLETED') {
        return { error: 'This ride is already completed.', status: 400 as const };
      }

      await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED' },
      });

      // Only restore seat if it was confirmed (seat was taken).
      if (booking.status === 'BOOKED') {
        const seatsAvailable = booking.ride.seatsAvailable + 1;
        const newStatus =
          booking.ride.status === 'FULL' || booking.ride.status === 'ACTIVE'
            ? 'ACTIVE'
            : booking.ride.status;

        await tx.ride.update({
          where: { id: booking.rideId },
          data: {
            seatsAvailable,
            ...(booking.ride.status === 'FULL' || booking.ride.status === 'ACTIVE'
              ? { status: newStatus }
              : {}),
          },
        });
      }

      return { ok: true as const };
    });

    if ('error' in result && result.error) {
      return res.status(result.status ?? 400).json({ error: result.error });
    }

    return res.json({ ok: true, message: 'Booking cancelled.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not cancel booking. Try again.' });
  }
});

export default router;
