import { Router } from 'express';
import { getClient, query } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { deleteCache } from '../config/redis.js';

const router = Router();

// Simulated asynchronous delay helper
const simulateLatency = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

// POST /api/payments/mock - Simulated payment gateway endpoint
router.post('/mock', authenticateToken, async (req, res) => {
  const { reservation_id, action = 'approve', idempotency_key } = req.body;

  if (!reservation_id) {
    return res.status(400).json({ error: 'reservation_id is required' });
  }

  // 1. Idempotency Check: Handle repeated requests safely without duplicate charges
  const existingOrderRes = await query(
    `SELECT o.*, t.payment_reference, t.status AS transaction_status
     FROM orders o
     LEFT JOIN transactions t ON t.order_id = o.id
     WHERE o.reservation_id = $1`,
    [reservation_id]
  );

  if (existingOrderRes.rows.length > 0) {
    const existingOrder = existingOrderRes.rows[0];
    if (existingOrder.status === 'confirmed') {
      return res.status(200).json({
        message: 'Order was already processed successfully (Idempotent response)',
        is_duplicate: true,
        order: existingOrder,
      });
    }
  }

  // Simulate gateway asynchronous network call
  await simulateLatency(350);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 2. Lock the reservation row exclusively
    const resResult = await client.query(
      `SELECT 
        r.id,
        r.attendee_id,
        r.ticket_id,
        r.quantity,
        r.status,
        r.expiry_timestamp,
        t.price,
        t.event_id,
        t.total_quantity,
        t.sold_quantity
       FROM reservations r
       JOIN tickets t ON r.ticket_id = t.id
       WHERE r.id = $1
       FOR UPDATE OF r`,
      [reservation_id]
    );

    if (resResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const reservation = resResult.rows[0];

    // Authorization check
    if (req.user.role !== 'admin' && reservation.attendee_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Forbidden: You cannot pay for someone else\'s reservation' });
    }

    // Status check
    if (reservation.status !== 'held') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot process payment: Reservation is already in '${reservation.status}' state`,
        status: reservation.status,
      });
    }

    // Expiry check: Never allow payment completion for expired reservations
    const now = new Date();
    const expiry = new Date(reservation.expiry_timestamp);
    if (now >= expiry) {
      await client.query("UPDATE reservations SET status = 'expired' WHERE id = $1", [reservation_id]);
      await client.query('COMMIT');
      await deleteCache(`event:${reservation.event_id}`);
      return res.status(400).json({
        error: 'Reservation has expired. Cannot complete payment. Tickets have been released.',
        is_expired: true,
      });
    }

    const totalAmount = reservation.price * reservation.quantity;
    const paymentRef = `txn_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Lock the ticket row
    await client.query('SELECT id FROM tickets WHERE id = $1 FOR UPDATE', [reservation.ticket_id]);

    if (action === 'approve') {
      // Confirm reservation
      await client.query("UPDATE reservations SET status = 'completed' WHERE id = $1", [reservation_id]);

      // Permanently decrement available inventory by incrementing sold_quantity
      await client.query(
        'UPDATE tickets SET sold_quantity = sold_quantity + $1 WHERE id = $2',
        [reservation.quantity, reservation.ticket_id]
      );

      // Create confirmed order
      const orderRes = await client.query(
        `INSERT INTO orders (attendee_id, reservation_id, total_amount, status)
         VALUES ($1, $2, $3, 'confirmed')
         RETURNING id, attendee_id, reservation_id, total_amount, status, created_at`,
        [reservation.attendee_id, reservation_id, totalAmount]
      );
      const order = orderRes.rows[0];

      // Record successful transaction
      const txnRes = await client.query(
        `INSERT INTO transactions (order_id, payment_reference, amount, status)
         VALUES ($1, $2, $3, 'success')
         RETURNING id, order_id, payment_reference, amount, status, created_at`,
        [order.id, paymentRef, totalAmount]
      );
      const transaction = txnRes.rows[0];

      await client.query('COMMIT');
      await deleteCache(`event:${reservation.event_id}`);

      return res.status(200).json({
        success: true,
        gateway_mode: 'SIMULATION',
        message: 'Mock payment approved successfully! Order confirmed.',
        order,
        transaction,
      });
    } else {
      // Payment Rejected / Declined
      // Release the held tickets by marking reservation cancelled
      await client.query("UPDATE reservations SET status = 'cancelled' WHERE id = $1", [reservation_id]);

      // Record failed order and failed transaction
      const orderRes = await client.query(
        `INSERT INTO orders (attendee_id, reservation_id, total_amount, status)
         VALUES ($1, $2, $3, 'failed')
         RETURNING id, attendee_id, reservation_id, total_amount, status, created_at`,
        [reservation.attendee_id, reservation_id, totalAmount]
      );
      const order = orderRes.rows[0];

      const txnRes = await client.query(
        `INSERT INTO transactions (order_id, payment_reference, amount, status)
         VALUES ($1, $2, $3, 'failed')
         RETURNING id, order_id, payment_reference, amount, status, created_at`,
        [order.id, paymentRef, totalAmount]
      );
      const transaction = txnRes.rows[0];

      await client.query('COMMIT');
      await deleteCache(`event:${reservation.event_id}`);

      return res.status(400).json({
        success: false,
        gateway_mode: 'SIMULATION',
        error: 'Simulated payment was declined. Reservation cancelled and tickets released.',
        order,
        transaction,
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Mock Payment Gateway Error]:', err);
    return res.status(500).json({ error: 'Internal gateway error during payment simulation' });
  } finally {
    client.release();
  }
});

export default router;
