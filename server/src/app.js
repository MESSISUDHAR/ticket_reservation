import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import eventRoutes from './routes/events.js';
import reservationRoutes from './routes/reservations.js';
import paymentRoutes from './routes/payments.js';
import organizerRoutes from './routes/organizer.js';
import adminRoutes from './routes/admin.js';
import attendeeRoutes from './routes/attendee.js';
import { releaseExpiredReservations } from './workers/expiryWorker.js';

const app = express();

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'event-reservation-api',
  });
});

// Manual trigger for worker (useful for testing or admin jobs)
app.post('/api/worker/run-now', async (req, res) => {
  const released = await releaseExpiredReservations();
  res.json({ message: 'Expiry worker ran', released_count: released.length, released });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/organizer', organizerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/attendee', attendeeRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

export default app;
