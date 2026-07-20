import cron from 'node-cron';
import { prisma } from '../prisma';
import { sendExpoPush } from './push';

/** Every 15 minutes: remind riders ~2 hours before ride time. */
export function startReminderCron() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const now = new Date();
      const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const windowStart = new Date(inTwoHours.getTime() - 10 * 60 * 1000);
      const windowEnd = new Date(inTwoHours.getTime() + 10 * 60 * 1000);

      const bookings = await prisma.booking.findMany({
        where: {
          status: 'BOOKED',
          reminderSent: false,
          ride: {
            status: { in: ['ACTIVE', 'FULL'] },
          },
        },
        include: {
          ride: true,
          rider: true,
        },
      });

      for (const booking of bookings) {
        const rideDate = booking.ride.date;
        const [hh, mm] = booking.ride.time.split(':').map(Number);
        const rideAt = new Date(rideDate);
        rideAt.setHours(hh, mm, 0, 0);

        if (rideAt < windowStart || rideAt > windowEnd) continue;
        if (!booking.rider.expoPushToken) continue;

        await sendExpoPush([
          {
            to: booking.rider.expoPushToken,
            title: 'Ride reminder',
            body: `Your ride starts in about 2 hours. Pickup: ${booking.ride.pickupPoint}`,
            data: { bookingId: booking.id },
          },
        ]);

        await prisma.booking.update({
          where: { id: booking.id },
          data: { reminderSent: true },
        });
      }
    } catch (err) {
      console.warn('Reminder cron error:', err);
    }
  });
}
