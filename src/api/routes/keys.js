// src/api/routes/keys.js
// Called internally (by you) to provision API keys for new customers
const express = require('express');
const router  = express.Router();
const db      = require('../../shared/db');
const { v4: uuidv4 } = require('uuid');

// Protected by SETUP_SECRET — not exposed publicly
router.post('/create', async (req, res) => {
  const secret = req.headers['x-setup-secret'];
  if (secret !== process.env.SETUP_SECRET) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const { business_id, plan = 'starter', expires_days } = req.body;
  if (!business_id) return res.status(400).json({ success: false, error: 'business_id required' });

  try {
    // Ensure api_keys table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id            SERIAL PRIMARY KEY,
        key           TEXT UNIQUE NOT NULL,
        business_id   INTEGER REFERENCES businesses(id),
        plan          TEXT DEFAULT 'starter',
        is_active     INTEGER DEFAULT 1,
        request_count INTEGER DEFAULT 0,
        last_used_at  TIMESTAMP,
        expires_at    TIMESTAMP,
        created_at    TIMESTAMP DEFAULT NOW()
      )
    `);

    const key       = `fo_${plan}_${uuidv4().replace(/-/g, '')}`;
    const expiresAt = expires_days
      ? new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000)
      : null;

    await db.query(
      `INSERT INTO api_keys (key, business_id, plan, expires_at)
       VALUES ($1,$2,$3,$4)`,
      [key, business_id, plan, expiresAt]
    );

    res.status(201).json({
      success: true,
      data: { key, business_id, plan, expires_at: expiresAt }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
