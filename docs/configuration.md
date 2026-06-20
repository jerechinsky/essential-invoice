# Configuration

## Environment Variables

Copy `.env.example` to `.env` in the project root and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `db` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `essential_invoice` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres` | Database password |
| `JWT_SECRET` | - | JWT signing secret (required) |
| `ENCRYPTION_KEY` | - | AES-256 key for encrypting secrets at rest (required, 64-char hex). Generate with `openssl rand -hex 32` |
| `CORS_ORIGIN` | `http://localhost:5173` (dev) / `http://localhost:8080` (Docker) | Allowed CORS origins (comma-separated) |
| `BACKEND_PORT` | `3001` | Backend API port |
| `FRONTEND_PORT` | `80` | Frontend web port |
| `EMAIL_POLLING_INTERVAL` | `600` | Email check interval (seconds, default 10 minutes) |
| `RECURRING_INVOICE_INTERVAL` | `86400` | Recurring invoice generation check interval (seconds, default 24 hours) |
| `FRONTEND_URL` | `http://localhost:8080` | Frontend URL for email links (password reset) |
| `GLOBAL_SMTP_HOST` | - | Global SMTP server host (enables system emails) |
| `GLOBAL_SMTP_PORT` | `587` | Global SMTP server port |
| `GLOBAL_SMTP_USER` | - | Global SMTP username |
| `GLOBAL_SMTP_PASSWORD` | - | Global SMTP password |
| `GLOBAL_SMTP_SECURE` | `false` | Use TLS for global SMTP |
| `GLOBAL_SMTP_FROM_EMAIL` | - | Sender email for system emails |
| `GLOBAL_SMTP_FROM_NAME` | `essentialInvoice` | Sender name for system emails |

## Language / Localization

The application supports Czech (`cs`, default) and English (`en`). Each user's language preference is stored in the `users.language` column and can be changed on the Profile page.

The preference affects:
- All frontend UI text (via react-i18next)
- Generated PDF invoices (labels, footer text)
- Email templates (invoice emails, welcome email, password reset)
- Date and currency formatting

The `GET /auth/me` endpoint returns the `language` field; `PUT /auth/me` accepts it to update the preference.

## Invoice and Expense Defaults (In-App)

Settings controls the default VAT rate and payment terms for invoices, plus whether newly created expenses start as already paid. The paid state can be overridden on each new expense. In the expense form, changing the issue date moves the due date to 14 days later, and net and VAT-inclusive amount fields remain synchronized in either direction.

## SMTP Configuration (In-App)

Configure per-user email sending in Settings > Email (SMTP):
- SMTP Host (e.g., `smtp.gmail.com`)
- Port (typically 587 for TLS, 465 for SSL)
- Username and password
- Sender email and name

The client email subject and message can be customized independently in Settings. Both fields support `{{invoiceNumber}}`, `{{total}}`, `{{issueDate}}`, `{{dueDate}}`, `{{clientName}}`, and `{{senderName}}`. They can also be adjusted for a single delivery in the invoice send dialog.

### Accountant forwarding

In Settings, add the accountant email, customize the accountant subject and message templates, and choose whether **Send to accountant** is checked by default. The same placeholders as the client templates are available.

The invoice send dialog shows the accountant address with a separately editable subject and message. Successful delivery records the date and recipient address on the invoice. Recurring invoices with auto-send enabled also forward to the accountant when the default checkbox preference is enabled.

## IMAP Configuration (In-App)

Configure bank notification receiving in Settings > Email (IMAP):
- IMAP Host (e.g., `imap.gmail.com`)
- Port (typically 993 for TLS)
- Username and password
- Bank notification email filter (e.g., `noreply@airbank.cz`)

## AI Features (Optional)

To enable AI-powered features, each user needs to configure their own Perplexity API key:

1. Get an API key from [https://www.perplexity.ai/settings/api](https://www.perplexity.ai/settings/api)
2. Log in to Essential Invoice
3. Go to Settings (Nastavení)
4. Find the "AI funkce (Perplexity)" section
5. Enter your API key and save

Once configured, AI features become available:
- Payment matching suggestions in the Payments page
- Tax advisor chatbot accessible from the AI assistant
- Financial insights on the Dashboard
