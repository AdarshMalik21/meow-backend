import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import rideRoutes from './routes/rides';
import bookingRoutes from './routes/bookings';
import { initFirebaseAdmin, getFirebaseStatus } from './services/firebase';
import { startReminderCron } from './services/reminders';

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  const firebase = getFirebaseStatus();
  res.json({
    ok: true,
    firebase: firebase.ready,
    firebaseProject: firebase.projectId,
    firebaseSource: firebase.credentialSource,
    firebaseEnv: {
      hasB64: firebase.hasB64,
      hasJson: firebase.hasJson,
      hasCredPath: firebase.hasCredPath,
    },
    devAuth: process.env.ALLOW_DEV_AUTH === 'true',
  });
});

app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/rides', rideRoutes);
app.use('/bookings', bookingRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Zippycar API listening on http://0.0.0.0:${port}`);
  console.log(`Dev auth: ${process.env.ALLOW_DEV_AUTH === 'true' ? 'ON' : 'OFF'}`);
  console.log(`Firebase Admin: ${initFirebaseAdmin() ? 'ready' : 'not configured yet'}`);
  startReminderCron();
});
