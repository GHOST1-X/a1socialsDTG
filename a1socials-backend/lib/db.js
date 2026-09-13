// Postgres connection pool.
// Works with Supabase, Neon, Railway, or any standard Postgres connection string.
// Set DATABASE_URL in your environment variables (Vercel/Netlify dashboard, or .env locally).

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false } // most hosted Postgres providers require SSL
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
