import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { deleteCache } from '../config/redis.js';

const router = Router();

// GET /api/admin/summary - Platform-wide summary statistics
router.get('/summary', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    // 1. User metrics
    const usersMetrics = await query(`
      SELECT 
        COUNT(*) AS total_users,
        COUNT(*) FILTER (WHERE role = 'admin') AS admin_count,
        COUNT(*) FILTER (WHERE role = 'organizer') AS organizer_count,
        COUNT(*) FILTER (WHERE role = 'attendee') AS attendee_count
      FROM users
    `);

    // 2. Event metrics
    const eventsMetrics = await query(`
      SELECT 
        COUNT(*) AS total_events,
        COUNT(*) FILTER (WHERE status = 'active') AS active_events,
        COUNT(*) FILTER (WHERE status = 'draft') AS draft_events,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_events
      FROM events
    `);

    // 3. Ticket & Financial metrics
    const ticketsMetrics = await query(`
      SELECT 
        COALESCE(SUM(total_quantity), 0) AS total_capacity,
        COALESCE(SUM(sold_quantity), 0) AS total_tickets_sold,
        COALESCE(SUM(total_quantity - sold_quantity), 0) AS remaining_tickets
      FROM tickets
    `);

    const ordersMetrics = await query(`
      SELECT 
        COUNT(*) AS total_orders,
        COALESCE(SUM(total_amount), 0) AS platform_revenue,
        COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_orders,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed_orders
      FROM orders
    `);

    const reservationsMetrics = await query(`
      SELECT 
        COUNT(*) AS total_reservations,
        COUNT(*) FILTER (WHERE status = 'held') AS currently_held,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_holds,
        COUNT(*) FILTER (WHERE status = 'expired') AS expired_holds,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_holds
      FROM reservations
    `);

    // 4. Users list
    const usersList = await query(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
    );

    // 5. Events list
    const eventsList = await query(`
      SELECT 
        e.id, 
        e.title, 
        e.venue, 
        e.event_date, 
        e.sales_cutoff_date, 
        e.status, 
        e.created_at,
        u.name AS organizer_name,
        u.email AS organizer_email,
        COALESCE(SUM(t.total_quantity), 0) AS total_capacity,
        COALESCE(SUM(t.sold_quantity), 0) AS sold_quantity
      FROM events e
      JOIN users u ON e.organizer_id = u.id
      LEFT JOIN tickets t ON t.event_id = e.id
      GROUP BY e.id, u.name, u.email
      ORDER BY e.created_at DESC
    `);

    const rev = parseInt(ordersMetrics.rows[0].platform_revenue, 10);

    return res.json({
      summary: {
        users: {
          total: parseInt(usersMetrics.rows[0].total_users, 10),
          admins: parseInt(usersMetrics.rows[0].admin_count, 10),
          organizers: parseInt(usersMetrics.rows[0].organizer_count, 10),
          attendees: parseInt(usersMetrics.rows[0].attendee_count, 10),
          list: usersList.rows,
        },
        events: {
          total: parseInt(eventsMetrics.rows[0].total_events, 10),
          active: parseInt(eventsMetrics.rows[0].active_events, 10),
          draft: parseInt(eventsMetrics.rows[0].draft_events, 10),
          cancelled: parseInt(eventsMetrics.rows[0].cancelled_events, 10),
          list: eventsList.rows,
        },
        financials: {
          platform_revenue_cents: rev,
          platform_revenue_usd: (rev / 100).toFixed(2),
          total_orders: parseInt(ordersMetrics.rows[0].total_orders, 10),
          confirmed_orders: parseInt(ordersMetrics.rows[0].confirmed_orders, 10),
          failed_orders: parseInt(ordersMetrics.rows[0].failed_orders, 10),
          total_capacity: parseInt(ticketsMetrics.rows[0].total_capacity, 10),
          total_tickets_sold: parseInt(ticketsMetrics.rows[0].total_tickets_sold, 10),
          remaining_tickets: parseInt(ticketsMetrics.rows[0].remaining_tickets, 10),
        },
        reservations: reservationsMetrics.rows[0],
      },
    });
  } catch (err) {
    console.error('[Admin Summary Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch admin summary' });
  }
});

// PUT /api/admin/events/:id/status - Admin can change event status
router.put('/events/:id/status', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'draft', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: "Status must be 'active', 'draft', or 'cancelled'" });
    }

    const result = await query(
      'UPDATE events SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    await deleteCache(`event:${id}`);

    return res.json({
      message: `Event status updated to ${status}`,
      event: result.rows[0],
    });
  } catch (err) {
    console.error('[Admin Update Event Status Error]:', err);
    return res.status(500).json({ error: 'Failed to update event status' });
  }
});

export default router;
