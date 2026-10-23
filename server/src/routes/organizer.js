import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/organizer/analytics
router.get('/analytics', authenticateToken, requireRole('organizer', 'admin'), async (req, res) => {
  try {
    const isOrgAdmin = req.user.role === 'admin';
    const orgId = req.user.id;

    // Filter by organizer if not admin
    const orgFilter = isOrgAdmin ? '' : 'WHERE e.organizer_id = $1';
    const params = isOrgAdmin ? [] : [orgId];

    // 1. Ticket capacity & sales aggregate
    const ticketsAggSql = `
      SELECT 
        COALESCE(SUM(t.sold_quantity), 0) AS tickets_sold,
        COALESCE(SUM(t.total_quantity - t.sold_quantity), 0) AS remaining_tickets,
        COALESCE(SUM(t.total_quantity), 0) AS total_capacity
      FROM events e
      JOIN tickets t ON t.event_id = e.id
      ${orgFilter}
    `;
    const ticketsAggRes = await query(ticketsAggSql, params);
    const { tickets_sold, remaining_tickets, total_capacity } = ticketsAggRes.rows[0];

    // 2. Orders and Revenue aggregate
    const ordersAggSql = `
      SELECT 
        COALESCE(SUM(o.total_amount), 0) AS total_revenue,
        COUNT(DISTINCT o.id) AS total_orders
      FROM events e
      JOIN tickets t ON t.event_id = e.id
      JOIN reservations r ON r.ticket_id = t.id
      JOIN orders o ON o.reservation_id = r.id
      WHERE o.status = 'confirmed'
      ${isOrgAdmin ? '' : 'AND e.organizer_id = $1'}
    `;
    const ordersAggRes = await query(ordersAggSql, params);
    const { total_revenue, total_orders } = ordersAggRes.rows[0];

    // 3. Checkout sessions initiated (Total reservations initiated)
    const sessionsSql = `
      SELECT COUNT(DISTINCT r.id) AS initiated_sessions
      FROM events e
      JOIN tickets t ON t.event_id = e.id
      JOIN reservations r ON r.ticket_id = t.id
      ${orgFilter}
    `;
    const sessionsRes = await query(sessionsSql, params);
    const initiatedSessions = parseInt(sessionsRes.rows[0].initiated_sessions, 10);
    const successfulOrders = parseInt(total_orders, 10);

    const conversionRate = initiatedSessions > 0
      ? parseFloat(((successfulOrders / initiatedSessions) * 100).toFixed(1))
      : 0;

    // 4. Revenue & Sales by Event (for Recharts)
    const chartSql = `
      SELECT 
        e.id,
        e.title,
        COALESCE(SUM(CASE WHEN o.status = 'confirmed' THEN o.total_amount ELSE 0 END), 0) / 100.0 AS revenue_usd,
        COALESCE(SUM(t.sold_quantity), 0) AS tickets_sold,
        COALESCE(SUM(t.total_quantity), 0) AS total_capacity
      FROM events e
      LEFT JOIN tickets t ON t.event_id = e.id
      LEFT JOIN reservations r ON r.ticket_id = t.id
      LEFT JOIN orders o ON o.reservation_id = r.id
      ${orgFilter}
      GROUP BY e.id, e.title
      ORDER BY revenue_usd DESC
    `;
    const chartRes = await query(chartSql, params);

    // 5. Recent bookings
    const recentOrdersSql = `
      SELECT 
        o.id AS order_id,
        o.total_amount,
        o.status AS order_status,
        o.created_at,
        u.name AS attendee_name,
        u.email AS attendee_email,
        e.title AS event_title,
        t.tier_name,
        r.quantity
      FROM orders o
      JOIN reservations r ON o.reservation_id = r.id
      JOIN tickets t ON r.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      JOIN users u ON o.attendee_id = u.id
      WHERE o.status = 'confirmed'
      ${isOrgAdmin ? '' : 'AND e.organizer_id = $1'}
      ORDER BY o.created_at DESC
      LIMIT 10
    `;
    const recentOrdersRes = await query(recentOrdersSql, params);

    return res.json({
      analytics: {
        total_revenue: parseInt(total_revenue, 10),
        total_revenue_usd: (parseInt(total_revenue, 10) / 100).toFixed(2),
        tickets_sold: parseInt(tickets_sold, 10),
        remaining_tickets: parseInt(remaining_tickets, 10),
        total_capacity: parseInt(total_capacity, 10),
        total_orders: successfulOrders,
        initiated_sessions: initiatedSessions,
        conversion_rate: conversionRate,
        events_breakdown: chartRes.rows,
        recent_orders: recentOrdersRes.rows,
      },
    });
  } catch (err) {
    console.error('[Organizer Analytics Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch organizer analytics' });
  }
});

// GET /api/organizer/events - Get events owned by the organizer
router.get('/events', authenticateToken, requireRole('organizer', 'admin'), async (req, res) => {
  try {
    const isOrgAdmin = req.user.role === 'admin';
    const sql = `
      SELECT 
        e.*,
        u.name AS organizer_name,
        COALESCE(json_agg(
          json_build_object(
            'id', t.id,
            'tier_name', t.tier_name,
            'price', t.price,
            'total_quantity', t.total_quantity,
            'sold_quantity', t.sold_quantity
          )
        ) FILTER (WHERE t.id IS NOT NULL), '[]') AS tickets,
        COALESCE(SUM(t.sold_quantity), 0) AS total_sold,
        COALESCE(SUM(t.total_quantity), 0) AS total_capacity,
        COALESCE(SUM(t.sold_quantity * t.price), 0) AS total_gross
      FROM events e
      JOIN users u ON e.organizer_id = u.id
      LEFT JOIN tickets t ON t.event_id = e.id
      ${isOrgAdmin ? '' : 'WHERE e.organizer_id = $1'}
      GROUP BY e.id, u.name
      ORDER BY e.created_at DESC
    `;
    const params = isOrgAdmin ? [] : [req.user.id];
    const result = await query(sql, params);

    return res.json({ events: result.rows });
  } catch (err) {
    console.error('[Organizer Events Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch organizer events' });
  }
});

export default router;
