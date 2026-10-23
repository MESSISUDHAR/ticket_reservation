import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';

export async function seedDatabase() {
  const client = await pool.connect();
  try {
    console.log('[Database] Seeding test and demo data...');
    await client.query('BEGIN');

    // Clean tables
    await client.query('TRUNCATE transactions, orders, reservations, tickets, events, users RESTART IDENTITY CASCADE');

    // 1. Seed Users
    const passwordHash = await bcrypt.hash('password123', 10);
    const adminHash = await bcrypt.hash('admin123', 10);
    const orgHash = await bcrypt.hash('organizer123', 10);
    const attendeeHash = await bcrypt.hash('attendee123', 10);

    const usersResult = await client.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES 
        ('Platform Admin', 'admin@tickets.com', $1, 'admin'),
        ('Sarah Jenkins (SoundWave Productions)', 'organizer@soundwave.com', $2, 'organizer'),
        ('Marcus Vance (FutureTech Events)', 'marcus@futuretech.io', $2, 'organizer'),
        ('John Doe', 'attendee@example.com', $3, 'attendee'),
        ('Alice Smith', 'alice@example.com', $3, 'attendee')
      RETURNING id, name, email, role
    `, [adminHash, orgHash, attendeeHash]);

    const admin = usersResult.rows.find(u => u.role === 'admin');
    const org1 = usersResult.rows.find(u => u.email === 'organizer@soundwave.com');
    const org2 = usersResult.rows.find(u => u.email === 'marcus@futuretech.io');
    const attendee1 = usersResult.rows.find(u => u.email === 'attendee@example.com');
    const attendee2 = usersResult.rows.find(u => u.email === 'alice@example.com');

    // 2. Seed Events
    // Event 1: Future Tech Summit 2026 (Active, cutoff in 20 days)
    const event1Res = await client.query(`
      INSERT INTO events (organizer_id, title, description, venue, event_date, sales_cutoff_date, status)
      VALUES ($1, 'Global AI & Cloud Summit 2026', 'The premier international conference for AI, Autonomous Agents, and Distributed Cloud Computing. Featuring keynote speakers from top tech innovators.', 'Moscone Convention Center, San Francisco, CA', NOW() + INTERVAL '30 days', NOW() + INTERVAL '25 days', 'active')
      RETURNING id
    `, [org2.id]);
    const event1Id = event1Res.rows[0].id;

    // Event 2: Neon Pulse Electronic Festival (Active, cutoff in 10 days)
    const event2Res = await client.query(`
      INSERT INTO events (organizer_id, title, description, venue, event_date, sales_cutoff_date, status)
      VALUES ($1, 'Neon Pulse Music Festival 2026', 'A 2-day immersive electronic music experience with world-class audio-visuals, international DJs, and cutting-edge stage production.', 'Brooklyn Mirage & Avant Gardner, Brooklyn, NY', NOW() + INTERVAL '14 days', NOW() + INTERVAL '10 days', 'active')
      RETURNING id
    `, [org1.id]);
    const event2Id = event2Res.rows[0].id;

    // Event 3: Indie Developer Game Showcase (Active, cutoff in 40 days)
    const event3Res = await client.query(`
      INSERT INTO events (organizer_id, title, description, venue, event_date, sales_cutoff_date, status)
      VALUES ($1, 'Indie Game Expo & Pitch Fest', 'Showcase of the most anticipated indie games of 2026. Play unreleased demos, meet visionary creators, and attend developer masterclasses.', 'Austin Convention Hall, Austin, TX', NOW() + INTERVAL '45 days', NOW() + INTERVAL '40 days', 'active')
      RETURNING id
    `, [org2.id]);
    const event3Id = event3Res.rows[0].id;

    // Event 4: Retro Arcades Invitational (Expired Cutoff date to test cutoff validation!)
    const event4Res = await client.query(`
      INSERT INTO events (organizer_id, title, description, venue, event_date, sales_cutoff_date, status)
      VALUES ($1, 'Vintage Arcade Championships (Sales Closed)', 'Vintage arcade cabinet tournament and exhibition. Ticket sales cutoff has already elapsed.', 'Emerald City Arcade, Seattle, WA', NOW() + INTERVAL '2 days', NOW() - INTERVAL '1 day', 'active')
      RETURNING id
    `, [org1.id]);
    const event4Id = event4Res.rows[0].id;

    // 3. Seed Ticket Tiers
    // Event 1 Tiers
    const e1t1 = await client.query(`
      INSERT INTO tickets (event_id, tier_name, price, total_quantity, sold_quantity)
      VALUES ($1, 'VIP All-Access', 35000, 50, 12) RETURNING id
    `, [event1Id]);
    const e1t2 = await client.query(`
      INSERT INTO tickets (event_id, tier_name, price, total_quantity, sold_quantity)
      VALUES ($1, 'Premium Pass', 18000, 150, 45) RETURNING id
    `, [event1Id]);
    const e1t3 = await client.query(`
      INSERT INTO tickets (event_id, tier_name, price, total_quantity, sold_quantity)
      VALUES ($1, 'General Admission', 7500, 500, 110) RETURNING id
    `, [event1Id]);

    // Event 2 Tiers
    const e2t1 = await client.query(`
      INSERT INTO tickets (event_id, tier_name, price, total_quantity, sold_quantity)
      VALUES ($1, 'VIP Backstage Experience', 22000, 40, 8) RETURNING id
    `, [event2Id]);
    const e2t2 = await client.query(`
      INSERT INTO tickets (event_id, tier_name, price, total_quantity, sold_quantity)
      VALUES ($1, 'Early Bird Tier', 6500, 150, 90) RETURNING id
    `, [event2Id]);
    const e2t3 = await client.query(`
      INSERT INTO tickets (event_id, tier_name, price, total_quantity, sold_quantity)
      VALUES ($1, 'General Admission', 9500, 300, 60) RETURNING id
    `, [event2Id]);

    // Event 3 Tiers
    await client.query(`
      INSERT INTO tickets (event_id, tier_name, price, total_quantity, sold_quantity)
      VALUES 
        ($1, 'Developer Full Pass', 9000, 100, 25),
        ($1, 'Gamer Expo Ticket', 3000, 400, 80)
    `, [event3Id]);

    // Event 4 Tiers (Sales Closed)
    await client.query(`
      INSERT INTO tickets (event_id, tier_name, price, total_quantity, sold_quantity)
      VALUES ($1, 'Standard Entry', 2500, 50, 10)
    `, [event4Id]);

    // 4. Seed completed orders and transactions for Analytics
    // Order 1: Attendee 1 bought 2 VIP tickets for Event 1
    const res1 = await client.query(`
      INSERT INTO reservations (attendee_id, ticket_id, quantity, status, expiry_timestamp)
      VALUES ($1, $2, 2, 'completed', NOW() - INTERVAL '2 days') RETURNING id
    `, [attendee1.id, e1t1.rows[0].id]);
    
    const ord1 = await client.query(`
      INSERT INTO orders (attendee_id, reservation_id, total_amount, status)
      VALUES ($1, $2, 70000, 'confirmed') RETURNING id
    `, [attendee1.id, res1.rows[0].id]);

    await client.query(`
      INSERT INTO transactions (order_id, payment_reference, amount, status)
      VALUES ($1, 'txn_demo_70000_success', 70000, 'success')
    `, [ord1.rows[0].id]);

    // Order 2: Attendee 2 bought 1 VIP Backstage for Event 2
    const res2 = await client.query(`
      INSERT INTO reservations (attendee_id, ticket_id, quantity, status, expiry_timestamp)
      VALUES ($1, $2, 1, 'completed', NOW() - INTERVAL '1 day') RETURNING id
    `, [attendee2.id, e2t1.rows[0].id]);

    const ord2 = await client.query(`
      INSERT INTO orders (attendee_id, reservation_id, total_amount, status)
      VALUES ($1, $2, 22000, 'confirmed') RETURNING id
    `, [attendee2.id, res2.rows[0].id]);

    await client.query(`
      INSERT INTO transactions (order_id, payment_reference, amount, status)
      VALUES ($1, 'txn_demo_22000_success', 22000, 'success')
    `, [ord2.rows[0].id]);

    // Seed 1 active held reservation for testing
    await client.query(`
      INSERT INTO reservations (attendee_id, ticket_id, quantity, status, expiry_timestamp)
      VALUES ($1, $2, 1, 'held', NOW() + INTERVAL '10 minutes')
    `, [attendee1.id, e1t3.rows[0].id]);

    // Seed 1 expired held reservation for testing worker cleanup
    await client.query(`
      INSERT INTO reservations (attendee_id, ticket_id, quantity, status, expiry_timestamp)
      VALUES ($1, $2, 1, 'held', NOW() - INTERVAL '5 minutes')
    `, [attendee2.id, e1t3.rows[0].id]);

    await client.query('COMMIT');
    console.log('[Database] Seed completed successfully!');
    console.log('--- Default Demo Accounts ---');
    console.log('Admin:     admin@tickets.com / admin123');
    console.log('Organizer: organizer@soundwave.com / organizer123');
    console.log('Organizer: marcus@futuretech.io / organizer123');
    console.log('Attendee:  attendee@example.com / attendee123');
    console.log('Attendee:  alice@example.com / attendee123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Database] Seeding failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Run directly if invoked from CLI
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
