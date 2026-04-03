// src/api/middleware/rateLimit.js
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 60,               // 60 requests/minute per IP
  message: { success: false, error: 'Rate limit exceeded. Max 60 requests/minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: 'Rate limit exceeded for this endpoint. Max 10 requests/minute.' }
});

module.exports = { apiLimiter, strictLimiter };
