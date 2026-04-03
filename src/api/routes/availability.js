// src/api/routes/availability.js
const express = require('express');
const router  = express.Router();
const db      = require('../../shared/db');

/**
 * GET /v1/availability?date=YYYY-MM-DD
 */
router.get('/', async (req, res) => {
  const { date } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      error:   'date is required in YYYY-MM-DD format'
    });
  }

  // Block past dates
  if (new Date(date) < new Date(new Date().toDateString())) {
    return res.status(400).json({ success: false, error: 'Cannot check availability for past dates' });
  }

  try {
    const { rows: booked } = await db.query(
      `SELECT job_time, u.name AS staff_name
       FROM jobs j
       LEFT JOIN users u ON j.assigned_to = u.id
       WHERE j.job_date = $1
         AND (j.business_id = $2 OR j.business_id IS NULL)
         AND j.status NOT IN ('Cancelled','cancelled')
         AND j.deleted_at IS NULL`,
      [date, req.businessId]
    );

    const allSlots = [
      '09:00','10:00','11:00','12:00',
      '13:00','14:00','15:00','16:00','17:00'
    ];
    const bookedTimes = booked.map(r => r.job_time);
    const available   = allSlots.filter(s => !bookedTimes.includes(s));

    res.json({
      success: true,
      data: {
        date,
        available_slots: available,
        booked_slots:    booked.map(r => ({
          time:  r.job_time,
          staff: r.staff_name || 'Unassigned'
        })),
        total_available: available.length,
        total_booked:    booked.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
