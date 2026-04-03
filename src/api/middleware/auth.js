// src/api/middleware/auth.js
// API key authentication — keys stored in api_keys table
const db = require('../../shared/db');

async function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;

  if (!key) {
    return res.status(401).json({
      success: false,
      error:   'Missing API key',
      hint:    'Pass your key in the X-Api-Key header'
    });
  }

  try {
    const { rows } = await db.query(
      `SELECT * FROM api_keys
       WHERE key = $1 AND is_active = 1
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [key]
    );

    if (!rows[0]) {
      return res.status(403).json({ success: false, error: 'Invalid or expired API key' });
    }

    // Attach key metadata to request
    req.apiKey     = rows[0];
    req.businessId = rows[0].business_id; // scopes all queries

    // Log usage (non-blocking)
    db.query(
      `UPDATE api_keys SET last_used_at = NOW(), request_count = request_count + 1 WHERE id = $1`,
      [rows[0].id]
    ).catch(() => {});

    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    res.status(500).json({ success: false, error: 'Authentication error' });
  }
}

module.exports = { requireApiKey };
