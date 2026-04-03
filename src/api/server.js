// src/api/server.js
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const { requireApiKey } = require('./middleware/auth');
const { apiLimiter }    = require('./middleware/rateLimit');

const app = express();

app.use(cors());
app.use(express.json());
app.use(apiLimiter);

// ── Health check (public) ───────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    service: 'FieldOps Agent API',
    version: '1.0.0',
    docs:    'https://github.com/ebenova/fieldops-agent-api'
  });
});

// ── Internal key management (before auth middleware) ────────
app.use('/internal/keys', require('./routes/keys'));

// ── All v1 routes require API key ───────────────────────────
app.use('/v1', requireApiKey);
app.use('/v1/bookings',     require('./routes/bookings'));
app.use('/v1/availability', require('./routes/availability'));
app.use('/v1/invoices',     require('./routes/invoices'));
app.use('/v1/services',     require('./routes/services'));
app.use('/v1/staff',        require('./routes/staff'));

// ── 404 handler ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error:   'Endpoint not found',
    available: [
      'GET  /health',
      'GET  /v1/availability?date=YYYY-MM-DD',
      'GET  /v1/services',
      'GET  /v1/staff',
      'POST /v1/bookings',
      'GET  /v1/bookings/:id',
      'GET  /v1/invoices/unpaid',
      'POST /v1/invoices/recover'
    ]
  });
});

// ── Error handler ────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('API error:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const PORT = process.env.API_PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🚀 FieldOps Agent API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Docs:   http://localhost:${PORT}/v1\n`);
});

module.exports = app;
