# FieldOps Agent API

REST API + MCP Server for FieldOps Agent — WhatsApp-native booking, revenue recovery, staff coordination.

## Overview

This service provides:
- **REST API** for creating bookings, checking availability, managing invoices, and coordinating staff
- **MCP Server** for AI agents to interact with FieldOps data
- **WhatsApp integration** for automated confirmations and reminders
- **Payment links** via OxaPay (Nigeria) and Polar (Canada)

Shares the same PostgreSQL database as `fieldops-core` — no separate DB needed.

## Quick Start

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL + WhatsApp keys
npm start              # REST API on :4000
npm run mcp            # MCP server via stdio
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (public) |
| POST | `/v1/bookings` | Create a booking |
| GET | `/v1/bookings/:id` | Get booking details |
| GET | `/v1/availability?date=YYYY-MM-DD` | Check available time slots |
| GET | `/v1/services` | List available services |
| GET | `/v1/staff` | List active staff |
| POST | `/v1/staff/briefing` | Send job briefing to staff |
| GET | `/v1/invoices/unpaid` | List unpaid invoices |
| POST | `/v1/invoices/recover` | Send WhatsApp recovery message |

All `/v1/*` routes require `X-Api-Key` header.

## MCP Tools

| Tool | Description |
|------|-------------|
| `check_availability` | Check available booking slots for a date |
| `book_service` | Book a service and send WhatsApp confirmation |
| `send_payment_link` | Generate and send payment link via WhatsApp |
| `recover_invoice` | Send payment recovery message for unpaid invoice |
| `send_staff_briefing` | Send job briefing to assigned staff |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (shared with fieldops-core) |
| `API_PORT` | Port to run the API server (default: 4000) |
| `APP_URL` | Base URL for payment links and callbacks |
| `WHATSAPP_TOKEN` | Meta WhatsApp Business API token |
| `TWILIO_*` | Twilio credentials (fallback WhatsApp provider) |
| `OXAPAY_MERCHANT_KEY` | OxaPay merchant key (Nigeria payments) |
| `POLAR_ACCESS_TOKEN` | Polar access token (Canada payments) |
| `POLAR_PRODUCT_ID` | Polar product ID for checkout links |
| `SETUP_SECRET` | Secret for internal API key provisioning |

## Deploy to Railway

1. Connect this repo to Railway
2. Set environment variables from `.env.example`
3. Railway will auto-detect `npm start` as the start command
4. Add a custom domain or use the Railway-provided URL

## License

MIT — Ebenova Solutions
