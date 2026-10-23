import { query } from '../config/db.js';
import { deleteCache } from '../config/redis.js';

let workerInterval = null;

/**
 * Releases expired ticket reservations safely.
 * Uses atomic UPDATE with FOR UPDATE SKIP LOCKED to guarantee:
 * 1. Each hold is released only once.
 * 2. Overlapping worker executions never conflict.
 * 3. Completed orders (status = 'completed') are never touched.
 */
export async function releaseExpiredReservations() {
  try {
    const expiredRes = await query(`
      UPDATE reservations
      SET status = 'expired'
      WHERE id IN (
        SELECT id
        FROM reservations
        WHERE status = 'held'
          AND expiry_timestamp <= NOW()
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, ticket_id, quantity
    `);

    if (expiredRes.rows.length > 0) {
      console.log(`[Expiry Worker] Released ${expiredRes.rows.length} expired reservation holds`);
      
      // Invalidate Redis caches for affected events
      const ticketIds = expiredRes.rows.map(r => r.ticket_id);
      const eventsRes = await query(
        'SELECT DISTINCT event_id FROM tickets WHERE id = ANY($1)',
        [ticketIds]
      );
      for (const row of eventsRes.rows) {
        await deleteCache(`event:${row.event_id}`);
      }
    }

    return expiredRes.rows;
  } catch (err) {
    console.error('[Expiry Worker Error]:', err.message);
    return [];
  }
}

export function startExpiryWorker(intervalMs = 60000) {
  if (workerInterval) return;
  console.log(`[Expiry Worker] Starting background worker (interval: ${intervalMs / 1000}s)`);
  // Run once immediately
  releaseExpiredReservations();
  workerInterval = setInterval(releaseExpiredReservations, intervalMs);
}

export function stopExpiryWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('[Expiry Worker] Background worker stopped');
  }
}
