import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { query, pool } from '../src/config/db.js';
import { seedDatabase } from '../src/db/seed.js';

let server;
let baseUrl;

before(async () => {
  // Re-seed DB to a known clean state
  await seedDatabase();

  // Start server on an ephemeral port
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`[Test Suite] Running on ephemeral server at ${baseUrl}`);
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end();
});

// Helper for making API requests
async function api(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

describe('Multi-Tenant Event & Ticket Reservation System Tests', () => {

  let attendeeToken;
  let attendeeId;
  let attendee2Token;
  let organizerToken;
  let organizerId;
  let adminToken;
  let testTicketId;
  let testEventId;

  test('0. Setup: Authenticate test users', async () => {
    // Attendee 1
    const attRes = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'attendee@example.com', password: 'attendee123' },
    });
    assert.equal(attRes.status, 200);
    attendeeToken = attRes.data.token;
    attendeeId = attRes.data.user.id;

    // Attendee 2
    const att2Res = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'alice@example.com', password: 'attendee123' },
    });
    assert.equal(att2Res.status, 200);
    attendee2Token = att2Res.data.token;

    // Organizer
    const orgRes = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'organizer@soundwave.com', password: 'organizer123' },
    });
    assert.equal(orgRes.status, 200);
    organizerToken = orgRes.data.token;
    organizerId = orgRes.data.user.id;

    // Admin
    const admRes = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@tickets.com', password: 'admin123' },
    });
    assert.equal(admRes.status, 200);
    adminToken = admRes.data.token;

    // Get an active event with open sales & ticket
    const eventsRes = await api('/api/events');
    assert.equal(eventsRes.status, 200);
    assert.ok(eventsRes.data.events.length > 0);
    
    // Choose an active event whose cutoff date is in the future
    const openEvent = eventsRes.data.events.find(e => new Date(e.sales_cutoff_date) > new Date());
    assert.ok(openEvent, 'Must have at least one event with open sales');
    testEventId = openEvent.id;

    const eventDetails = await api(`/api/events/${testEventId}`);
    assert.equal(eventDetails.status, 200);
    assert.ok(eventDetails.data.event.tickets.length > 0);
    testTicketId = eventDetails.data.event.tickets[0].id;
  });

  // Requirement 11.6.1: Successful reservation and payment
  test('1. Successful reservation and payment', async () => {
    // Step 1: Create 10-minute temporary reservation hold
    const resRes = await api('/api/reservations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${attendeeToken}` },
      body: { ticket_id: testTicketId, quantity: 1 },
    });

    assert.equal(resRes.status, 201, 'Reservation should be created with 201');
    assert.equal(resRes.data.reservation.status, 'held');
    assert.ok(resRes.data.reservation.id);
    const reservationId = resRes.data.reservation.id;

    // Step 2: Confirm mock payment
    const payRes = await api('/api/payments/mock', {
      method: 'POST',
      headers: { Authorization: `Bearer ${attendeeToken}` },
      body: { reservation_id: reservationId, action: 'approve' },
    });

    assert.equal(payRes.status, 200, 'Payment should be approved with 200');
    assert.equal(payRes.data.success, true);
    assert.ok(payRes.data.order);
    assert.equal(payRes.data.order.status, 'confirmed');
    assert.ok(payRes.data.transaction);
    assert.equal(payRes.data.transaction.status, 'success');

    // Step 3: Verify DB state
    const resCheck = await query('SELECT status FROM reservations WHERE id = $1', [reservationId]);
    assert.equal(resCheck.rows[0].status, 'completed');
  });

  // Requirement 11.6.2: Rejected payment
  test('2. Rejected payment simulation releases inventory', async () => {
    // Step 1: Reserve ticket
    const resRes = await api('/api/reservations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${attendeeToken}` },
      body: { ticket_id: testTicketId, quantity: 1 },
    });
    assert.equal(resRes.status, 201);
    const reservationId = resRes.data.reservation.id;

    // Step 2: Simulate payment decline / rejection
    const payRes = await api('/api/payments/mock', {
      method: 'POST',
      headers: { Authorization: `Bearer ${attendeeToken}` },
      body: { reservation_id: reservationId, action: 'reject' },
    });

    assert.equal(payRes.status, 400, 'Rejection should return 400 error status');
    assert.equal(payRes.data.success, false);
    assert.equal(payRes.data.order.status, 'failed');

    // Step 3: Verify reservation was cancelled and released
    const resCheck = await query('SELECT status FROM reservations WHERE id = $1', [reservationId]);
    assert.equal(resCheck.rows[0].status, 'cancelled');
  });

  // Requirement 11.6.3: Expired reservation rejection
  test('3. Expired reservation rejects checkout attempt', async () => {
    // Step 1: Reserve ticket
    const resRes = await api('/api/reservations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${attendeeToken}` },
      body: { ticket_id: testTicketId, quantity: 1 },
    });
    assert.equal(resRes.status, 201);
    const reservationId = resRes.data.reservation.id;

    // Step 2: Manually expire the hold in PostgreSQL
    await query("UPDATE reservations SET expiry_timestamp = NOW() - INTERVAL '1 minute' WHERE id = $1", [reservationId]);

    // Step 3: Attempt payment on the expired hold
    const payRes = await api('/api/payments/mock', {
      method: 'POST',
      headers: { Authorization: `Bearer ${attendeeToken}` },
      body: { reservation_id: reservationId, action: 'approve' },
    });

    assert.equal(payRes.status, 400, 'Expired reservation must reject payment with 400');
    assert.equal(payRes.data.is_expired, true);
    assert.match(payRes.data.error, /expired/i);

    // Step 4: Verify DB marks status as expired
    const checkDb = await query('SELECT status FROM reservations WHERE id = $1', [reservationId]);
    assert.equal(checkDb.rows[0].status, 'expired');
  });

  // Requirement 11.6.4: Two concurrent attempts to reserve the final available ticket
  test('4. Concurrency: Two simultaneous booking requests for the final available ticket', async () => {
    // Step 1: Create an isolated single-ticket tier (capacity: 1)
    const newTierRes = await query(
      `INSERT INTO tickets (event_id, tier_name, price, total_quantity, sold_quantity)
       VALUES ($1, 'Final Seat Exclusive Tier', 9900, 1, 0)
       RETURNING id`,
      [testEventId]
    );
    const singleTicketTierId = newTierRes.rows[0].id;

    // Step 2: Fire two simultaneous concurrent reservation requests using Promise.all
    const [req1, req2] = await Promise.all([
      api('/api/reservations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${attendeeToken}` },
        body: { ticket_id: singleTicketTierId, quantity: 1 },
      }),
      api('/api/reservations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${attendee2Token}` },
        body: { ticket_id: singleTicketTierId, quantity: 1 },
      }),
    ]);

    // Step 3: Exactly ONE must succeed (201) and exactly ONE must fail (400)
    const statuses = [req1.status, req2.status].sort();
    assert.deepEqual(statuses, [201, 400], 'One request must succeed with 201 and the other fail with 400');

    // Find the failed request and verify message
    const failedReq = req1.status === 400 ? req1 : req2;
    assert.match(failedReq.data.error, /insufficient tickets/i);

    // Step 4: Verify in database that only 1 reservation was created
    const countRes = await query(
      "SELECT COUNT(*) AS total FROM reservations WHERE ticket_id = $1 AND status = 'held'",
      [singleTicketTierId]
    );
    assert.equal(parseInt(countRes.rows[0].total, 10), 1, 'Only exactly 1 hold must exist in DB');
  });

  // Requirement 11.6.5: Unauthorized access and role restrictions
  test('5. Unauthorized access and role-based restrictions', async () => {
    // Unauthenticated access
    const noAuth = await api('/api/organizer/analytics');
    assert.equal(noAuth.status, 401, 'Unauthenticated request must return 401');

    // Attendee attempting organizer-only endpoint
    const attendeeAttemptOrg = await api('/api/organizer/analytics', {
      headers: { Authorization: `Bearer ${attendeeToken}` },
    });
    assert.equal(attendeeAttemptOrg.status, 403, 'Attendee must be forbidden from organizer routes');

    // Attendee attempting admin-only endpoint
    const attendeeAttemptAdmin = await api('/api/admin/summary', {
      headers: { Authorization: `Bearer ${attendeeToken}` },
    });
    assert.equal(attendeeAttemptAdmin.status, 403, 'Attendee must be forbidden from admin summary');

    // Organizer attempting admin-only endpoint
    const orgAttemptAdmin = await api('/api/admin/summary', {
      headers: { Authorization: `Bearer ${organizerToken}` },
    });
    assert.equal(orgAttemptAdmin.status, 403, 'Organizer must be forbidden from admin summary');

    // Admin CAN access admin summary
    const adminAccess = await api('/api/admin/summary', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminAccess.status, 200, 'Admin must be allowed access to admin summary');
  });

  // Requirement 11.6.6: Duplicate payment requests
  test('6. Duplicate payment requests handled safely without double charges (Idempotency)', async () => {
    // Step 1: Create a reservation
    const resRes = await api('/api/reservations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${attendeeToken}` },
      body: { ticket_id: testTicketId, quantity: 1 },
    });
    assert.equal(resRes.status, 201);
    const reservationId = resRes.data.reservation.id;

    // Step 2: First payment approval
    const pay1 = await api('/api/payments/mock', {
      method: 'POST',
      headers: { Authorization: `Bearer ${attendeeToken}` },
      body: { reservation_id: reservationId, action: 'approve' },
    });
    assert.equal(pay1.status, 200);
    const originalOrderId = pay1.data.order.id;

    // Step 3: Send duplicate payment request for the exact same reservation
    const pay2 = await api('/api/payments/mock', {
      method: 'POST',
      headers: { Authorization: `Bearer ${attendeeToken}` },
      body: { reservation_id: reservationId, action: 'approve' },
    });

    assert.equal(pay2.status, 200, 'Duplicate request should return 200');
    assert.equal(pay2.data.is_duplicate, true, 'Response must identify idempotency duplicate');
    assert.equal(pay2.data.order.id, originalOrderId, 'Must return the same original order ID');

    // Step 4: Verify DB has exactly ONE order for this reservation
    const ordersCount = await query('SELECT COUNT(*) AS total FROM orders WHERE reservation_id = $1', [reservationId]);
    assert.equal(parseInt(ordersCount.rows[0].total, 10), 1, 'Never create duplicate orders for a single reservation');
  });

  // Extra validation: Expired Cutoff Date rejection
  test('7. Cannot reserve tickets after sales cutoff date has elapsed', async () => {
    // Event 4 in seed data has cutoff date in the past
    const expiredEventRes = await query("SELECT id FROM events WHERE title ILIKE '%Sales Closed%'");
    assert.ok(expiredEventRes.rows.length > 0);
    const expiredEventId = expiredEventRes.rows[0].id;

    const ticketsRes = await query('SELECT id FROM tickets WHERE event_id = $1', [expiredEventId]);
    assert.ok(ticketsRes.rows.length > 0);
    const expiredTicketId = ticketsRes.rows[0].id;

    const res = await api('/api/reservations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${attendeeToken}` },
      body: { ticket_id: expiredTicketId, quantity: 1 },
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /cutoff date has passed/i);
  });
});
