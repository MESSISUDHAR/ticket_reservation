import { Router } from 'express';
import { getClient, query } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { deleteCache } from '../config/redis.js';

const router = Router();

// POST /api/reservations - Create a 10-minute temporary ticket reservation hold
// Protected with database row-level locking (SELECT ... FOR UPDATE) to prevent race conditions
router.post('/', authenticateToken, async (req, res) => {
  const client = await getClient();
  try {
    const { ticket_id, quantity = 1 } = req.body;
    const qty = parseInt(quantity, 10);

    if (!ticket_id || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Valid ticket_id and positive quantity are required' });
    }

    await client.query('BEGIN');

    // 1. Lock the ticket tier row exclusively
    const ticketRes = await client.query(
      `SELECT 
        t.id, 
        t.event_id, 
        t.tier_name, 
        t.price, 
        t.total_quantity, 
        t.sold_quantity,
        e.title AS event_title,
        e.venue,
        e.event_date,
        e.sales_cutoff_date,
        e.status AS event_status
       FROM tickets t
       JOIN events e ON t.event_id = e.id
       WHERE t.id = $1
       FOR UPDATE OF t`,
      [ticket_id]
    );

    if (ticketRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ticket tier not found' });
    }

    const ticket = ticketRes.rows[0];

    // 2. Check event status
    if (ticket.event_status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Event is currently ${ticket.event_status} and not accepting bookings` });
    }

    // 3. Check sales cutoff date
    const now = new Date();
    if (now > new Date(ticket.sales_cutoff_date)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Ticket sales cutoff date has passed for this event' });
    }

    // 4. Calculate active held tickets for this tier
    const heldRes = await client.query(
      `SELECT COALESCE(SUM(quantity), 0) AS active_held
       FROM reservations
       WHERE ticket_id = $1 
         AND status = 'held' 
         AND expiry_timestamp > NOW()`,
      [ticket_id]
    );

    const activeHeld = parseInt(heldRes.rows[0].active_held, 10);
    const available = ticket.total_quantity - ticket.sold_quantity - activeHeld;

    // 5. Concurrency check
    if (qty > available) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Insufficient tickets available. Only ${available} left (requested ${qty})`,
        available,
        requested: qty,
      });
    }

    // 6. Hold lasts exactly 10 minutes
    const expiryMinutes = parseInt(process.env.RESERVATION_EXPIRY_MINUTES || '10', 10);

    const resInsert = await client.query(
      `INSERT INTO reservations (attendee_id, ticket_id, quantity, status, expiry_timestamp)
       VALUES ($1, $2, $3, 'held', NOW() + ($4 || ' minutes')::INTERVAL)
       RETURNING id, attendee_id, ticket_id, quantity, status, expiry_timestamp, created_at`,
      [req.user.id, ticket_id, qty, expiryMinutes]
    );

    await client.query('COMMIT');

    const reservation = resInsert.rows[0];

    // Invalidate event cache so other viewers see updated availability
    await deleteCache(`event:${ticket.event_id}`);

    const totalAmount = ticket.price * qty;

    return res.status(201).json({
      message: 'Temporary reservation hold created successfully (10-minute lock)',
      reservation: {
        ...reservation,
        event_id: ticket.event_id,
        event_title: ticket.event_title,
        venue: ticket.venue,
        event_date: ticket.event_date,
        tier_name: ticket.tier_name,
        unit_price: ticket.price,
        total_amount: totalAmount,
        expires_in_seconds: expiryMinutes * 60,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Create Reservation Error]:', err);
    return res.status(500).json({ error: 'Failed to create ticket reservation' });
  } finally {
    client.release();
  }
});

// GET /api/reservations/:id - Get reservation details & remaining time
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT 
        r.id,
        r.attendee_id,
        r.ticket_id,
        r.quantity,
        r.status,
        r.expiry_timestamp,
        r.created_at,
        t.tier_name,
        t.price,
        t.event_id,
        e.title AS event_title,
        e.venue,
        e.event_date,
        u.name AS attendee_name,
        u.email AS attendee_email,
        o.id AS order_id,
        o.status AS order_status
       FROM reservations r
       JOIN tickets t ON r.ticket_id = t.id
       JOIN events e ON t.event_id = e.id
       JOIN users u ON r.attendee_id = u.id
       LEFT JOIN orders o ON o.reservation_id = r.id
       WHERE r.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const reservation = result.rows[0];

    // Check permissions (attendee owner, organizer of the event, or admin)
    if (
      req.user.role !== 'admin' &&
      reservation.attendee_id !== req.user.id
    ) {
      return res.status(403).json({ error: 'Forbidden: You cannot view this reservation' });
    }

    const now = new Date();
    const expiry = new Date(reservation.expiry_timestamp);
    let isExpired = now >= expiry;

    // Auto-update to expired if still marked held but past time
    if (reservation.status === 'held' && isExpired) {
      await query(
        "UPDATE reservations SET status = 'expired' WHERE id = $1 AND status = 'held'",
        [id]
      );
      reservation.status = 'expired';
      await deleteCache(`event:${reservation.event_id}`);
    }

    const remainingSeconds = Math.max(0, Math.floor((expiry.getTime() - now.getTime()) / 1000));
    const totalAmount = reservation.price * reservation.quantity;

    return res.json({
      reservation: {
        ...reservation,
        total_amount: totalAmount,
        remaining_seconds: reservation.status === 'held' ? remainingSeconds : 0,
        is_expired: isExpired,
      },
    });
  } catch (err) {
    console.error('[Get Reservation Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch reservation' });
  }
});

// POST /api/reservations/:id/cancel - Attendee voluntarily cancels their hold
router.post('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const check = await query('SELECT * FROM reservations WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const reservation = check.rows[0];
    if (req.user.role !== 'admin' && reservation.attendee_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: Cannot cancel someone else\'s reservation' });
    }

    if (reservation.status !== 'held') {
      return res.status(400).json({ error: `Cannot cancel reservation in '${reservation.status}' state` });
    }

    await query("UPDATE reservations SET status = 'cancelled' WHERE id = $1", [id]);

    const ticketRes = await query('SELECT event_id FROM tickets WHERE id = $1', [reservation.ticket_id]);
    if (ticketRes.rows.length > 0) {
      await deleteCache(`event:${ticketRes.rows[0].event_id}`);
    }

    return res.json({ message: 'Reservation cancelled successfully and tickets released' });
  } catch (err) {
    console.error('[Cancel Reservation Error]:', err);
    return res.status(500).json({ error: 'Failed to cancel reservation' });
  }
});

// GET /api/reservations/active/me - Current attendee active reservations
router.get('/active/me', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        r.id,
        r.ticket_id,
        r.quantity,
        r.status,
        r.expiry_timestamp,
        r.created_at,
        t.tier_name,
        t.price,
        t.event_id,
        e.title AS event_title,
        e.venue,
        e.event_date
       FROM reservations r
       JOIN tickets t ON r.ticket_id = t.id
       JOIN events e ON t.event_id = e.id
       WHERE r.attendee_id = $1 
         AND r.status = 'held' 
         AND r.expiry_timestamp > NOW()
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    const reservations = result.rows.map(r => {
      const remainingSeconds = Math.max(0, Math.floor((new Date(r.expiry_timestamp) - new Date()) / 1000));
      return {
        ...r,
        total_amount: r.price * r.quantity,
        remaining_seconds: remainingSeconds,
      };
    });

    return res.json({ reservations });
  } catch (err) {
    console.error('[Get My Active Reservations Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch user reservations' });
  }
});

export default router;
