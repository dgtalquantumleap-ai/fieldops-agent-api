#!/usr/bin/env node
// src/mcp/server.js
// MCP Server — AI agents can use these tools to interact with FieldOps

require('dotenv').config();
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const db      = require('../shared/db');
const { sendWhatsAppMessage } = require('../shared/whatsapp');
const { generatePaymentLink, detectRegion } = require('../shared/payments');

const server = new McpServer({
  name:    'fieldops-agent',
  version: '1.0.0',
});

// ─────────────────────────────────────────────────
// TOOL 1: check_availability
// ─────────────────────────────────────────────────
server.tool(
  'check_availability',
  'Check available booking slots for a given date',
  {
    date:        z.string().describe('Date in YYYY-MM-DD format'),
    business_id: z.number().optional().describe('Business ID (optional — uses default if not provided)')
  },
  async ({ date, business_id }) => {
    const bizId = business_id || null;
    const { rows } = await db.query(
      `SELECT job_time FROM jobs
       WHERE job_date = $1
         AND (business_id = $2 OR ($2::INTEGER IS NULL AND business_id IS NULL))
         AND status NOT IN ('Cancelled','cancelled')
         AND deleted_at IS NULL`,
      [date, bizId]
    );
    const booked   = rows.map(r => r.job_time);
    const allSlots = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
    const available = allSlots.filter(s => !booked.includes(s));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ date, available_slots: available, booked_slots: booked })
      }]
    };
  }
);

// ─────────────────────────────────────────────────
// TOOL 2: book_service
// ─────────────────────────────────────────────────
server.tool(
  'book_service',
  'Book a cleaning or service appointment and send WhatsApp confirmation with payment link',
  {
    customer_name:  z.string().describe('Full name of the customer'),
    customer_phone: z.string().describe('Customer WhatsApp number in E.164 format e.g. +14031234567'),
    service:        z.string().describe('Service name e.g. "Deep Clean", "Standard Clean"'),
    date:           z.string().describe('Date in YYYY-MM-DD format'),
    time:           z.string().describe('Time in HH:MM 24h format'),
    address:        z.string().describe('Full service address'),
    business_id:    z.number().optional().describe('Business ID'),
  },
  async ({ customer_name, customer_phone, service, date, time, address, business_id }) => {
    const bizId = business_id || null;
    try {
      // Find or create customer
      let customer = (await db.query(
        `SELECT * FROM customers WHERE phone = $1
         AND (business_id = $2 OR business_id IS NULL)`,
        [customer_phone, bizId]
      )).rows[0];

      if (!customer) {
        customer = (await db.query(
          `INSERT INTO customers (name, phone, address, notes, business_id)
           VALUES ($1,$2,$3,'MCP booking',$4) RETURNING *`,
          [customer_name, customer_phone, address, bizId]
        )).rows[0];
      }

      const serviceRecord = (await db.query(
        `SELECT * FROM services WHERE name ILIKE $1 AND is_active = 1
         AND (business_id = $2 OR business_id IS NULL) LIMIT 1`,
        [`%${service}%`, bizId]
      )).rows[0];

      if (!serviceRecord) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Service "${service}" not found` }) }] };
      }

      const staff = (await db.query(`
        SELECT u.id, u.name, u.phone FROM users u
        LEFT JOIN jobs j ON u.id = j.assigned_to
          AND j.job_date = $1 AND j.deleted_at IS NULL
        WHERE u.is_active = 1 AND u.role IN ('staff','admin','owner')
          AND (u.business_id = $2 OR u.business_id IS NULL)
        GROUP BY u.id, u.name, u.phone ORDER BY COUNT(j.id) ASC LIMIT 1
      `, [date, bizId])).rows[0];

      const job = (await db.query(
        `INSERT INTO jobs
           (customer_id, service_id, assigned_to, job_date, job_time,
            location, status, notes, business_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'Scheduled','MCP booking',$7,NOW(),NOW())
         RETURNING *`,
        [customer.id, serviceRecord.id, staff?.id || null,
         date, time, address, bizId]
      )).rows[0];

      const paymentLink = await generatePaymentLink({
        jobId:         job.id,
        amount:        serviceRecord.price,
        customerName:  customer_name,
        customerPhone: customer_phone,
        region:        detectRegion(customer_phone),
        description:   `${serviceRecord.name} — ${date}`
      }).catch(() => null);

      // Send WhatsApp
      const msg = `✅ Booking confirmed!\n📋 ${serviceRecord.name}\n📅 ${date} at ${time}\n📍 ${address}\n👤 Staff: ${staff?.name || 'TBD'}\n💰 $${serviceRecord.price}` +
        (paymentLink ? `\n\n💳 Pay here: ${paymentLink}` : '');

      await sendWhatsAppMessage(customer_phone, msg).catch(() => {});

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success:       true,
            booking_id:    job.id,
            service:       serviceRecord.name,
            date, time, address,
            staff:         staff?.name || 'TBD',
            amount:        serviceRecord.price,
            payment_link:  paymentLink
          })
        }]
      };

    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] };
    }
  }
);

// ─────────────────────────────────────────────────
// TOOL 3: send_payment_link
// ─────────────────────────────────────────────────
server.tool(
  'send_payment_link',
  'Generate and send a payment link to a customer via WhatsApp',
  {
    customer_phone: z.string().describe('Customer WhatsApp number'),
    job_id:         z.number().describe('Job ID to generate payment for'),
    amount:         z.number().describe('Amount to charge'),
    currency:       z.enum(['CAD','NGN','USD']).default('CAD').describe('Currency')
  },
  async ({ customer_phone, job_id, amount, currency }) => {
    try {
      const region = currency === 'NGN' ? 'NG' : 'CA';
      const link   = await generatePaymentLink({
        jobId:         job_id,
        amount,
        customerName:  'Customer',
        customerPhone: customer_phone,
        region,
        description:   `Job #${job_id}`
      });

      await sendWhatsAppMessage(
        customer_phone,
        `💳 Your payment link is ready!\nAmount: $${amount} ${currency}\n\nPay here: ${link}`
      );

      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, payment_link: link }) }]
      };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] };
    }
  }
);

// ─────────────────────────────────────────────────
// TOOL 4: recover_invoice
// ─────────────────────────────────────────────────
server.tool(
  'recover_invoice',
  'Send a WhatsApp payment recovery message for an unpaid invoice',
  {
    invoice_id: z.number().describe('Invoice ID'),
    step:       z.number().min(1).max(3).default(1).describe('Escalation step: 1=polite, 2=firm, 3=final')
  },
  async ({ invoice_id, step }) => {
    try {
      const { rows } = await db.query(`
        SELECT i.*, c.name AS customer_name, c.phone AS customer_phone
        FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id
        WHERE i.id = $1 AND i.deleted_at IS NULL
      `, [invoice_id]);

      const inv = rows[0];
      if (!inv) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Invoice not found' }) }] };

      const link = await generatePaymentLink({
        jobId:         inv.job_id,
        amount:        inv.amount,
        customerName:  inv.customer_name,
        customerPhone: inv.customer_phone,
        region:        detectRegion(inv.customer_phone),
        description:   `Invoice ${inv.invoice_number}`
      }).catch(() => null);

      const msgs = {
        1: `Hi ${inv.customer_name}! 👋 Reminder — Invoice ${inv.invoice_number} for $${inv.amount} is due.`,
        2: `Hi ${inv.customer_name}, Invoice ${inv.invoice_number} ($${inv.amount}) is now overdue. Please settle soon.`,
        3: `${inv.customer_name}, final notice — Invoice ${inv.invoice_number} ($${inv.amount}) remains unpaid.`
      };

      const fullMsg = msgs[step] + (link ? `\n\n💳 Pay: ${link}` : '');
      await sendWhatsAppMessage(inv.customer_phone, fullMsg);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success:      true,
            invoice_id,
            customer:     inv.customer_name,
            amount:       inv.amount,
            step,
            message_sent: true,
            payment_link: link
          })
        }]
      };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] };
    }
  }
);

// ─────────────────────────────────────────────────
// TOOL 5: send_staff_briefing
// ─────────────────────────────────────────────────
server.tool(
  'send_staff_briefing',
  'Send a WhatsApp job briefing to an assigned staff member',
  {
    job_id: z.number().describe('Job ID to send briefing for')
  },
  async ({ job_id }) => {
    try {
      const { rows } = await db.query(`
        SELECT j.*, c.name AS customer_name, c.phone AS customer_phone,
               s.name AS service_name, u.name AS staff_name, u.phone AS staff_phone
        FROM jobs j
        LEFT JOIN customers c ON j.customer_id = c.id
        LEFT JOIN services s  ON j.service_id  = s.id
        LEFT JOIN users u     ON j.assigned_to  = u.id
        WHERE j.id = $1 AND j.deleted_at IS NULL
      `, [job_id]);

      const job = rows[0];
      if (!job)            return { content: [{ type: 'text', text: JSON.stringify({ error: 'Job not found' }) }] };
      if (!job.staff_phone) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Staff has no phone number' }) }] };

      const msg =
        `📋 *Job Briefing*\n\n` +
        `Service: ${job.service_name}\n` +
        `Date: ${job.job_date} at ${job.job_time || 'TBD'}\n` +
        `Customer: ${job.customer_name} (${job.customer_phone || 'N/A'})\n` +
        `Address: ${job.location}\n` +
        `Notes: ${job.notes || 'None'}\n\n` +
        `Reply *confirmed* when on your way ✅`;

      await sendWhatsAppMessage(job.staff_phone, msg);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, job_id, staff: job.staff_name, message_sent: true })
        }]
      };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] };
    }
  }
);

// ─────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('✅ FieldOps MCP Server running');
}

main().catch(err => {
  console.error('MCP Server error:', err);
  process.exit(1);
});
