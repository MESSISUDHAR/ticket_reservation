import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/event_reservation';

const isRemote = connectionString.includes('supabase') || connectionString.includes('neon') || connectionString.includes('railway') || connectionString.includes('render');

export const pool = new Pool({
  connectionString,
  ssl: isRemote ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client', err);
});

export const query = (text, params) => pool.query(text, params);

export const getClient = () => pool.connect();

export default {
  pool,
  query,
  getClient,
};
