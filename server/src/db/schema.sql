-- Schema for Multi-Tenant Event & Ticket Reservation System

DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'organizer', 'attendee')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Events table
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    organizer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    venue VARCHAR(255) NOT NULL,
    event_date TIMESTAMPTZ NOT NULL,
    sales_cutoff_date TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tickets table (Ticket tiers: VIP, Premium, General Admission, etc.)
CREATE TABLE tickets (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    tier_name VARCHAR(100) NOT NULL,
    price INTEGER NOT NULL CHECK (price >= 0), -- Stored in cents (e.g., 5000 = $50.00)
    total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
    sold_quantity INTEGER NOT NULL DEFAULT 0 CHECK (sold_quantity >= 0),
    CONSTRAINT check_sold_lte_total CHECK (sold_quantity <= total_quantity)
);

-- 4. Reservations table (Temporary ticket holds, e.g., 10 minutes)
CREATE TABLE reservations (
    id SERIAL PRIMARY KEY,
    attendee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status VARCHAR(50) NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'completed', 'expired', 'cancelled')),
    expiry_timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Orders table
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    attendee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reservation_id INTEGER UNIQUE REFERENCES reservations(id) ON DELETE SET NULL,
    total_amount INTEGER NOT NULL CHECK (total_amount >= 0), -- Stored in cents
    status VARCHAR(50) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'failed', 'refunded')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Transactions table
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    payment_reference VARCHAR(255) UNIQUE NOT NULL,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'failed')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX idx_events_organizer ON events(organizer_id);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_tickets_event ON tickets(event_id);
CREATE INDEX idx_reservations_ticket_status_expiry ON reservations(ticket_id, status, expiry_timestamp);
CREATE INDEX idx_reservations_status_expiry ON reservations(status, expiry_timestamp);
CREATE INDEX idx_reservations_attendee ON reservations(attendee_id);
CREATE INDEX idx_orders_attendee ON orders(attendee_id);
CREATE INDEX idx_orders_reservation ON orders(reservation_id);
CREATE INDEX idx_transactions_order ON transactions(order_id);
