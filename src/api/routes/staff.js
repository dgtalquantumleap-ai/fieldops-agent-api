// src/api/routes/staff.js
const express = require('express');
const router  = express.Router();
const db      = require('../../shared/db');
const { sendWhatsAppMessage } = require('../../shared/whatsapp');

/**
 * POST /v1/staff/briefing
 * Send a WhatsApp job briefing to a staff member
 */
router.post('/briefing', async (req, res) => {
  const { staff_id, job_id } = req.body;

  if (!staff_id || !job_id) {
    return res.status(400).json({ success: false, error: 'staff_id and job_id are required' });
  }

  try {
    const jobRes = await db.query(`
      SELECT j.*, c.name AS customer_name, c.phone AS customer_phone,
             s.name AS service_name, u.name AS staff_name, u.phone AS staff_phone
      FROM jobs j
      LEFT JOIN customers c ON j.customer_id = c.id
      LEFT JOIN services s  ON j.service_id  = s.id
      LEFT JOIN users u     ON j.assigned_to  = u.id
      WHERE j.id = $1
        AND (j.business_id = $2 OR j.business_id IS NULL)
        AND j.deleted_at IS NULL
    `, [job_id, req.businessId]);

    const job = jobRes.rows[0];
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    if (!job.staff_phone) return res.status(400).json({ success: false, error: 'Staff member has no phone number' });

    const message =
      `📋 *Job Briefing*\n\n` +
      `Service: ${job.service_name}\n` +
      `Date: ${job.job_date} at ${job.job_time || 'TBD'}\n` +
      `Customer: ${job.customer_name}\n` +
      `Phone: ${job.customer_phone || 'N/A'}\n` +
      `Address: ${job.location}\n` +
      `Notes: ${job.notes || 'None'}\n\n` +
      `Please reply *confirmed* when you're on your way ✅`;

    await sendWhatsAppMessage(job.staff_phone, message);

    res.json({
      success: true,
      data: {
        job_id,
        staff_id,
        staff_name:  job.staff_name,
        staff_phone: job.staff_phone,
        message_sent: true
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /v1/staff
 */
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, name, phone, email, role
      FROM users
      WHERE is_active = 1
        AND role IN ('staff','admin','owner')
        AND (business_id = $1 OR business_id IS NULL)
      ORDER BY name
    `, [req.businessId]);

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
