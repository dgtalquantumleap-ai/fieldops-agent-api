// src/api/routes/invoices.js
const express = require('express');
const router  = express.Router();
const db      = require('../../shared/db');
const { sendWhatsAppMessage } = require('../../shared/whatsapp');
const { generatePaymentLink, detectRegion } = require('../../shared/payments');

/**
 * POST /v1/invoices/recover
 * Trigger a WhatsApp recovery message for an unpaid invoice
 */
router.post('/recover', async (req, res) => {
  const { invoice_id, step = 1 } = req.body;

  if (!invoice_id) {
    return res.status(400).json({ success: false, error: 'invoice_id is required' });
  }

  if (![1, 2, 3].includes(Number(step))) {
    return res.status(400).json({ success: false, error: 'step must be 1 (polite), 2 (firm), or 3 (final)' });
  }

  try {
    const { rows } = await db.query(`
      SELECT i.*, c.name AS customer_name, c.phone AS customer_phone
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE i.id = $1
        AND (i.business_id = $2 OR i.business_id IS NULL)
        AND i.deleted_at IS NULL
    `, [invoice_id, req.businessId]);

    const invoice = rows[0];
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    if (invoice.status === 'paid') return res.status(400).json({ success: false, error: 'Invoice already paid' });
    if (!invoice.customer_phone) return res.status(400).json({ success: false, error: 'Customer has no phone number' });

    // Generate fresh payment link
    const paymentLink = await generatePaymentLink({
      jobId:         invoice.job_id,
      amount:        invoice.amount,
      customerName:  invoice.customer_name,
      customerPhone: invoice.customer_phone,
      region:        detectRegion(invoice.customer_phone),
      description:   `Invoice ${invoice.invoice_number}`
    }).catch(() => `${process.env.APP_URL}/pay?invoice=${invoice_id}`);

    const messages = {
      1: `Hi ${invoice.customer_name}! 👋 Quick reminder — Invoice ${invoice.invoice_number} for $${invoice.amount} is ready. Pay when you get a chance 😊\n\n💳 ${paymentLink}`,
      2: `Hi ${invoice.customer_name}, Invoice ${invoice.invoice_number} ($${invoice.amount}) is now overdue. Please settle this as soon as possible.\n\n💳 ${paymentLink}`,
      3: `${invoice.customer_name}, this is a final notice. Invoice ${invoice.invoice_number} ($${invoice.amount}) remains unpaid. Please pay immediately or contact us.\n\n💳 ${paymentLink}`
    };

    await sendWhatsAppMessage(invoice.customer_phone, messages[step]);

    // Log dunning step
    await db.query(
      `INSERT INTO dunning_log (invoice_id, customer_id, step, channel, message_sent, business_id)
       VALUES ($1,$2,$3,'whatsapp',$4,$5)
       ON CONFLICT DO NOTHING`,
      [invoice_id, invoice.customer_id, step, messages[step], req.businessId]
    ).catch(() => {});

    if (step >= 2) {
      await db.query(
        "UPDATE invoices SET status = 'overdue' WHERE id = $1 AND status = 'unpaid'",
        [invoice_id]
      ).catch(() => {});
    }

    res.json({
      success: true,
      data: {
        invoice_id,
        invoice_number: invoice.invoice_number,
        customer:       invoice.customer_name,
        phone:          invoice.customer_phone,
        amount:         invoice.amount,
        step,
        message_sent:   true,
        payment_link:   paymentLink
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /v1/invoices/unpaid
 * List all unpaid invoices for this business
 */
router.get('/unpaid', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT i.id, i.invoice_number, i.amount, i.status, i.issued_at,
             c.name AS customer_name, c.phone AS customer_phone
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE i.status IN ('unpaid','overdue')
        AND (i.business_id = $1 OR i.business_id IS NULL)
        AND i.deleted_at IS NULL
      ORDER BY i.issued_at ASC
    `, [req.businessId]);

    const totalOwed = rows.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

    res.json({
      success: true,
      data: {
        invoices:    rows,
        total_count: rows.length,
        total_owed:  totalOwed.toFixed(2)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
