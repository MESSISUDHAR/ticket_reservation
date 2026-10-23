import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// GET /api/attendee/orders - Get orders and bookings for the authenticated attendee
router.get('/orders', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        o.id AS order_id,
        o.total_amount,
        o.status AS order_status,
        o.created_at AS order_date,
        t.payment_reference,
        r.id AS reservation_id,
        r.quantity,
        tk.tier_name,
        tk.price AS unit_price,
        e.id AS event_id,
        e.title AS event_title,
        e.venue,
        e.event_date
       FROM orders o
       JOIN reservations r ON o.reservation_id = r.id
       JOIN tickets tk ON r.ticket_id = tk.id
       JOIN events e ON tk.event_id = e.id
       LEFT JOIN transactions t ON t.order_id = o.id
       WHERE o.attendee_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    return res.json({ orders: result.rows });
  } catch (err) {
    console.error('[Attendee Orders Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch attendee orders' });
  }
});

export default router;
