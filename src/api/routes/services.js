// src/api/routes/services.js
const express = require('express');
const router  = express.Router();
const db      = require('../../shared/db');

/**
 * GET /v1/services
 */
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, price, description
       FROM services
       WHERE is_active = 1
         AND (business_id = $1 OR business_id IS NULL)
       ORDER BY name`,
      [req.businessId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
