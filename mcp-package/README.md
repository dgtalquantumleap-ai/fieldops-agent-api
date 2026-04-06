# @ebenova/fieldops-mcp

MCP server for [FieldOps](https://ebenova.dev) — WhatsApp-native booking, payment collection, invoice recovery, and staff coordination for cleaning and field service businesses. Use directly from Claude Desktop, Cursor, or any MCP client.

## Tools

| Tool | Description |
|------|-------------|
| `check_availability` | Check available booking slots for a given date |
| `book_service` | Book a service appointment with WhatsApp confirmation + payment link |
| `send_payment_link` | Generate and send a payment link via WhatsApp |
| `recover_invoice` | Send escalating payment recovery messages (polite → firm → final) |
| `send_staff_briefing` | Send a job briefing to assigned staff via WhatsApp |

## Installation

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fieldops": {
      "command": "npx",
      "args": ["-y", "@ebenova/fieldops-mcp"],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@host:5432/fieldops",
        "TWILIO_ACCOUNT_SID": "AC...",
        "TWILIO_AUTH_TOKEN": "...",
        "TWILIO_WHATSAPP_NUMBER": "+14155238886"
      }
    }
  }
}
```

**Config file location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "fieldops": {
      "command": "npx",
      "args": ["-y", "@ebenova/fieldops-mcp"],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@host:5432/fieldops",
        "TWILIO_ACCOUNT_SID": "AC...",
        "TWILIO_AUTH_TOKEN": "...",
        "TWILIO_WHATSAPP_NUMBER": "+14155238886"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `TWILIO_ACCOUNT_SID` | No* | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | No* | Twilio Auth Token |
| `TWILIO_WHATSAPP_NUMBER` | No* | Twilio WhatsApp sender number |
| `WHATSAPP_TOKEN` | No* | Meta WhatsApp Business API token (alternative to Twilio) |
| `WHATSAPP_PHONE_NUMBER_ID` | No* | Meta WhatsApp phone number ID |
| `OXAPAY_MERCHANT_KEY` | No | OxaPay merchant key for NGN payments |
| `POLAR_ACCESS_TOKEN` | No | Polar.sh access token for CAD payments |
| `POLAR_PRODUCT_ID` | No | Polar.sh product ID |
| `APP_URL` | No | Base URL for payment callbacks (defaults to https://fieldops.ebenova.dev) |

\* WhatsApp is required for messaging features. Use either Twilio OR Meta WhatsApp Business API.

## Example Prompts

Once connected, you can say things like:

- *"What slots are available on Friday March 28th?"*
- *"Book a deep clean for Sarah at 123 Main St, tomorrow at 2pm. Her number is +14031234567"*
- *"Send a payment link for $150 to +2348012345678 for job 42"*
- *"Send a polite reminder for invoice 15"*
- *"Invoice 15 is still unpaid — escalate to step 2"*
- *"Send the briefing for job 42 to the assigned staff"*

## How It Works

1. **Booking** — Creates customer + job records in PostgreSQL, auto-assigns least-busy staff
2. **WhatsApp** — Sends booking confirmations, payment links, and staff briefings via Twilio or Meta
3. **Payments** — Generates payment links via Polar (CAD) or OxaPay (NGN) based on customer region
4. **Recovery** — 3-step escalation for unpaid invoices, each step with a fresh payment link

## Database Schema

Requires these PostgreSQL tables: `customers`, `services`, `users`, `jobs`, `invoices`. See the [FieldOps setup guide](https://github.com/ebenova/fieldops-agent-api) for migration scripts.

## Part of Ebenova

- [@ebenova/legal-docs-mcp](https://www.npmjs.com/package/@ebenova/legal-docs-mcp) — Legal document generation
- [@ebenova/reddit-monitor-mcp](https://www.npmjs.com/package/@ebenova/reddit-monitor-mcp) — Reddit keyword monitoring

## License

MIT
