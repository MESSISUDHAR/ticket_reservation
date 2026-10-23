import app from './app.js';
import dotenv from 'dotenv';
import { startExpiryWorker } from './workers/expiryWorker.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Event & Ticket Reservation API running on port ${PORT}`);
  console.log(`📡 Base URL: http://localhost:${PORT}`);
  console.log(`=======================================================`);

  // Start background worker to check and release expired reservations every 60 seconds
  startExpiryWorker(60000);
});

export default server;
