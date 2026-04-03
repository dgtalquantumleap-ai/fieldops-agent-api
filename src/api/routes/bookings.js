// src/api/routes/bookings.js
const express = require('express');
const router  = express.Router();
const db      = require('../../shared/db');
const { generatePaymentLink, detectRegion } = require('../../shared/payments');
const { sendWhatsAppMessage } = require('../../shared/whatsapp');

/**
 * POST /v1/bookings
 * Create a booking and optionally send a WhatsApp confirmation + payment link
 */
router.post('/', async (req, res) => {
  const {
    customer_name,
    customer_phone,
    customer_email,
    service,
    date,           // YYYY-MM-DD
    time,           // HH:MM
    address,
    notes,
    send_whatsapp = true,
    send_payment_link = true
  } = req.body;

  // Validate required fields
  const required = { customer_name, customer_phone, service, date, time, address };
  const missing  = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    return res.status(400).json({ success: false, error: `Missing fields: ${missing.join(', ')}` });
  }

  const businessId = req.businessId;

  try {
    // Find or create customer
    let customer = (await db.query(
      `SELECT * FROM customers WHERE phone = $1
       AND (business_id = $2 OR business_id IS NULL)`,
      [customer_phone, businessId]
    )).rows[0];

    if (!customer) {
      customer = (await db.query(
        `INSERT INTO customers (name, phone, email, address, notes, business_id)
         VALUES ($1,$2,$3,$4,'API booking',$5) RETURNING *`,
        [customer_name, customer_phone, customer_email || null, address, businessId]
      )).rows[0];
    }

    // Find service
    const serviceRecord = (await db.query(
      `SELECT * FROM services
       WHERE name ILIKE $1 AND is_active = 1
         AND (business_id = $2 OR business_id IS NULL)
       LIMIT 1`,
      [`%${service}%`, businessId]
    )).rows[0];

    if (!serviceRecord) {
      return res.status(404).json({
        success: false,
        error: `Service "${service}" not found`,
        hint:  'Call GET /v1/services to see available services'
      });
    }

    // Check for duplicate
    const dup = (await db.query(
      `SELECT id FROM jobs
       WHERE customer_id = $1 AND job_date = $2 AND job_time = $3
         AND status NOT IN ('Cancelled','cancelled')`,
      [customer.id, date, time]
    )).rows[0];

    if (dup) {
      return res.status(409).json({
        success: false,
        error:   'Duplicate booking — customer already has a booking at this date/time',
        booking_id: dup.id
      });
    }

    // Assign least-loaded staff
    const staff = (await db.query(`
      SELECT u.id, u.name, u.phone FROM users u
      LEFT JOIN jobs j ON u.id = j.assigned_to
        AND j.job_date = $1 AND j.deleted_at IS NULL
      WHERE u.is_active = 1
        AND u.role IN ('staff','admin','owner')
        AND (u.business_id = $2 OR u.business_id IS NULL)
      GROUP BY u.id, u.name, u.phone
      ORDER BY COUNT(j.id) ASC LIMIT 1
    `, [date, businessId])).rows[0];

    // Create job
    const job = (await db.query(
      `INSERT INTO jobs
         (customer_id, service_id, assigned_to, job_date, job_time,
          location, status, notes, business_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'Scheduled',$7,$8,NOW(),NOW())
       RETURNING *`,
      [customer.id, serviceRecord.id, staff?.id || null,
       date, time, address, notes || null, businessId]
    )).rows[0];

    // Generate payment link
    let paymentLink = null;
    if (send_payment_link) {
      try {
        paymentLink = await generatePaymentLink({
          jobId:        job.id,
          amount:       serviceRecord.price,
          customerName: customer_name,
          customerPhone: customer_phone,
          region:       detectRegion(customer_phone),
          description:  `${serviceRecord.name} — ${date}`
        });
      } catch (e) {
        console.warn('Payment link failed (non-critical):', e.message);
      }
    }

    // Send WhatsApp confirmation to customer
    if (send_whatsapp && customer_phone) {
      const msg = `✅ Booking confirmed!\n\n` +
        `📋 ${serviceRecord.name}\n` +
        `📅 ${date} at ${time}\n` +
        `📍 ${address}\n` +
        `👤 Staff: ${staff?.name || 'TBD'}\n` +
        `💰 $${serviceRecord.price}\n` +
        (paymentLink ? `\n💳 Pay here: ${paymentLink}` : '');

      sendWhatsAppMessage(customer_phone, msg).catch(e =>
        console.warn('WhatsApp send failed (non-critical):', e.message)
      );

      // Notify staff
      if (staff?.phone) {
        const staffMsg = `📋 New job assigned!\n` +
          `Service: ${serviceRecord.name}\n` +
          `Date: ${date} at ${time}\n` +
          `Customer: ${customer_name}\n` +
          `Address: ${address}\n` +
          `Notes: ${notes || 'None'}\n\nPlease confirm ✅`;

        sendWhatsAppMessage(staff.phone, staffMsg).catch(() => {});
      }
    }

    res.status(201).json({
      success: true,
      data: {
        booking_id:    job.id,
        customer_id:   customer.id,
        service:       serviceRecord.name,
        date,
        time,
        address,
        amount:        serviceRecord.price,
        currency:      'CAD',
        staff_assigned: staff?.name || null,
        payment_link:  paymentLink,
        status:        'Scheduled'
      }
    });

  } catch (err) {
    console.error('Booking error:', err.message);
    res.status(500).json({ success: false, error: 'Booking failed', detail: err.message });
  }
});

/**
 * GET /v1/bookings/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT j.*, c.name AS customer_name, c.phone AS customer_phone,
             s.name AS service_name, s.price AS amount,
             u.name AS staff_name
      FROM jobs j
      LEFT JOIN customers c ON j.customer_id = c.id
      LEFT JOIN services s  ON j.service_id  = s.id
      LEFT JOIN users u     ON j.assigned_to  = u.id
      WHERE j.id = $1
        AND (j.business_id = $2 OR j.business_id IS NULL)
        AND j.deleted_at IS NULL
    `, [req.params.id, req.businessId]);

    if (!rows[0]) return res.status(404).json({ success: false, error: 'Booking not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
