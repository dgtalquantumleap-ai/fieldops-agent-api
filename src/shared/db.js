// src/shared/db.js
// Connects to the same Railway PostgreSQL as fieldops-core
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : undefined,
  max: 5,
  idleTimeoutMillis: 30000,
});

pool.on('error', err => console.error('DB pool error:', err.message));
module.exports = pool;
