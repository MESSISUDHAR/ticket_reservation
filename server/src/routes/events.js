import { Router } from 'express';
import { query, getClient } from '../config/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { getCache, setCache, deleteCache } from '../config/redis.js';

const router = Router();

// GET /api/events - List events
router.get('/', async (req, res) => {
  try {
    const { search, status } = req.query;
    let sql = `
      SELECT 
        e.id, 
        e.organizer_id, 
        e.title, 
        e.description, 
        e.venue, 
        e.event_date, 
        e.sales_cutoff_date, 
        e.status, 
        e.created_at,
        u.name AS organizer_name,
        COALESCE(MIN(t.price), 0) AS min_price,
        COALESCE(MAX(t.price), 0) AS max_price,
        COALESCE(SUM(t.total_quantity), 0) AS total_capacity,
        COALESCE(SUM(t.sold_quantity), 0) AS total_sold,
        COALESCE(SUM(
          GREATEST(0, t.total_quantity - t.sold_quantity - (
            SELECT COALESCE(SUM(r.quantity), 0)
            FROM reservations r
            WHERE r.ticket_id = t.id AND r.status = 'held' AND r.expiry_timestamp > NOW()
          ))
        ), 0) AS total_available
      FROM events e
      JOIN users u ON e.organizer_id = u.id
      LEFT JOIN tickets t ON t.event_id = e.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND e.status = $${params.length}`;
    } else {
      // By default show active events
      sql += ` AND e.status = 'active'`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (e.title ILIKE $${params.length} OR e.venue ILIKE $${params.length} OR e.description ILIKE $${params.length})`;
    }

    sql += ` GROUP BY e.id, u.name ORDER BY e.event_date ASC`;

    const result = await query(sql, params);
    return res.json({ events: result.rows });
  } catch (err) {
    console.error('[Get Events Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// GET /api/events/:id - Get event details with ticket tiers and Redis caching
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `event:${id}`;

    // Check Redis cache first
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({ event: cached, source: 'cache' });
    }

    // Fetch event details
    const eventResult = await query(
      `SELECT e.*, u.name AS organizer_name, u.email AS organizer_email
       FROM events e
       JOIN users u ON e.organizer_id = u.id
       WHERE e.id = $1`,
      [id]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventResult.rows[0];

    // Fetch ticket tiers with live available inventory calculation
    const ticketsResult = await query(
      `SELECT 
        t.id, 
        t.event_id, 
        t.tier_name, 
        t.price, 
        t.total_quantity, 
        t.sold_quantity,
        COALESCE((
          SELECT SUM(r.quantity)
          FROM reservations r
          WHERE r.ticket_id = t.id AND r.status = 'held' AND r.expiry_timestamp > NOW()
        ), 0) AS active_held_quantity,
        GREATEST(0, t.total_quantity - t.sold_quantity - COALESCE((
          SELECT SUM(r.quantity)
          FROM reservations r
          WHERE r.ticket_id = t.id AND r.status = 'held' AND r.expiry_timestamp > NOW()
        ), 0)) AS available_quantity
       FROM tickets t
       WHERE t.event_id = $1
       ORDER BY t.price ASC`,
      [id]
    );

    event.tickets = ticketsResult.rows;
    event.is_cutoff_passed = new Date() > new Date(event.sales_cutoff_date);

    // Cache active event details for 120 seconds
    await setCache(cacheKey, event, 120);

    return res.json({ event, source: 'database' });
  } catch (err) {
    console.error('[Get Event Details Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch event details' });
  }
});

// POST /api/events - Create new event (Organizer / Admin)
router.post('/', authenticateToken, requireRole('organizer', 'admin'), async (req, res) => {
  const client = await getClient();
  try {
    const { title, description, venue, event_date, sales_cutoff_date, status = 'active', tickets = [] } = req.body;

    if (!title || !venue || !event_date || !sales_cutoff_date) {
      return res.status(400).json({ error: 'Title, venue, event_date, and sales_cutoff_date are required' });
    }

    if (new Date(sales_cutoff_date) > new Date(event_date)) {
      return res.status(400).json({ error: 'Sales cutoff date cannot be after the event date' });
    }

    if (!Array.isArray(tickets) || tickets.length === 0) {
      return res.status(400).json({ error: 'At least one ticket tier must be provided' });
    }

    await client.query('BEGIN');

    const eventResult = await client.query(
      `INSERT INTO events (organizer_id, title, description, venue, event_date, sales_cutoff_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, title.trim(), description || '', venue.trim(), event_date, sales_cutoff_date, status]
    );

    const createdEvent = eventResult.rows[0];

    const createdTickets = [];
    for (const t of tickets) {
      if (!t.tier_name || t.price === undefined || t.total_quantity === undefined) {
        throw new Error('Each ticket tier must have tier_name, price, and total_quantity');
      }
      const ticketRes = await client.query(
        `INSERT INTO tickets (event_id, tier_name, price, total_quantity, sold_quantity)
         VALUES ($1, $2, $3, $4, 0)
         RETURNING *`,
        [createdEvent.id, t.tier_name.trim(), parseInt(t.price, 10), parseInt(t.total_quantity, 10)]
      );
      createdTickets.push(ticketRes.rows[0]);
    }

    await client.query('COMMIT');

    createdEvent.tickets = createdTickets;
    return res.status(201).json({
      message: 'Event created successfully',
      event: createdEvent,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Create Event Error]:', err);
    return res.status(400).json({ error: err.message || 'Failed to create event' });
  } finally {
    client.release();
  }
});

// PUT /api/events/:id - Update existing event
router.put('/:id', authenticateToken, requireRole('organizer', 'admin'), async (req, res) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    const { title, description, venue, event_date, sales_cutoff_date, status, tickets } = req.body;

    await client.query('BEGIN');

    // Check ownership
    const existing = await client.query('SELECT * FROM events WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = existing.rows[0];
    if (req.user.role !== 'admin' && event.organizer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Forbidden: You can only edit your own events' });
    }

    // Update event fields
    const updatedEventRes = await client.query(
      `UPDATE events 
       SET 
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         venue = COALESCE($3, venue),
         event_date = COALESCE($4, event_date),
         sales_cutoff_date = COALESCE($5, sales_cutoff_date),
         status = COALESCE($6, status)
       WHERE id = $7
       RETURNING *`,
      [title, description, venue, event_date, sales_cutoff_date, status, id]
    );

    // If new tickets are provided, update/insert them
    if (Array.isArray(tickets)) {
      for (const t of tickets) {
        if (t.id) {
          // Update existing tier
          await client.query(
            `UPDATE tickets 
             SET tier_name = COALESCE($1, tier_name),
                 price = COALESCE($2, price),
                 total_quantity = GREATEST(sold_quantity, COALESCE($3, total_quantity))
             WHERE id = $4 AND event_id = $5`,
            [t.tier_name, t.price, t.total_quantity, t.id, id]
          );
        } else if (t.tier_name && t.price !== undefined && t.total_quantity !== undefined) {
          // Insert new tier
          await client.query(
            `INSERT INTO tickets (event_id, tier_name, price, total_quantity, sold_quantity)
             VALUES ($1, $2, $3, $4, 0)`,
            [id, t.tier_name, t.price, t.total_quantity]
          );
        }
      }
    }

    await client.query('COMMIT');

    // Invalidate Redis cache
    await deleteCache(`event:${id}`);

    return res.json({
      message: 'Event updated successfully',
      event: updatedEventRes.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Update Event Error]:', err);
    return res.status(500).json({ error: 'Failed to update event' });
  } finally {
    client.release();
  }
});

export default router;
