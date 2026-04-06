// lib/db.js — PostgreSQL connection pool
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : undefined,
  max: 5,
  idleTimeoutMillis: 30000,
});

pool.on('error', err => console.error('[fieldops-mcp] DB pool error:', err.message));
module.exports = pool;
