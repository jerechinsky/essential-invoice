# API Reference

All endpoints require JWT authentication unless noted otherwise. Include the token in the `Authorization: Bearer <token>` header.

## Authentication

- `POST /api/auth/register` - Register new user (sends welcome email if global SMTP configured)
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/me` - Update profile
- `POST /api/auth/change-password` - Change password (requires current password)
- `POST /api/auth/forgot-password` - Request password reset email
- `POST /api/auth/reset-password` - Reset password with token
- `DELETE /api/auth/me` - Delete account (requires password confirmation)
- `GET /api/auth/me/logo` - Get user logo image
- `POST /api/auth/me/logo` - Upload user logo (multipart form data)
- `DELETE /api/auth/me/logo` - Delete user logo

The profile payload includes company invoicing fields such as `companyName`, `companyIco`, `companyDic`, `companyAddress`, and optional `companyRegisterInfo`. `companyRegisterInfo` is shown in the generated invoice PDF footer when provided.

## Clients

- `GET /api/clients` - List all clients
- `GET /api/clients/:id` - Get client details
- `GET /api/clients/:id/invoices` - Get client's invoices
- `POST /api/clients` - Create client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client

## Invoices

- `GET /api/invoices` - List invoices (filters: status, clientId, from, to)
- `GET /api/invoices/:id` - Get invoice with items
- `GET /api/invoices/:id/pdf` - Download PDF
- `POST /api/invoices` - Create invoice
- `PUT /api/invoices/:id` - Update invoice
- `PATCH /api/invoices/batch` - Update `status` and/or `accountantSent` on up to 100 selected invoices. Body: `{ ids: UUID[], status?: "draft" | "sent" | "paid" | "overdue" | "cancelled", accountantSent?: boolean }`
- `POST /api/invoices/batch-download` - Generate PDFs for up to 50 selected invoices and return one ZIP archive. Body: `{ ids: UUID[] }`
- `DELETE /api/invoices/:id` - Delete draft invoice
- `POST /api/invoices/:id/send` - Send via email. Optional `customSubject`/`customMessage` fields override the client email for one delivery. `sendToAccountant`, `accountantSubject`, and `accountantMessage` control the separately templated accountant copy. The response includes `accountantSent` and an optional `accountantError`; client delivery remains successful if only the accountant copy fails.
- `POST /api/invoices/:id/mark-sent` - Mark as sent manually (without sending email)
- `POST /api/invoices/:id/mark-paid` - Mark as paid
- `POST /api/invoices/:id/cancel` - Cancel invoice
- `GET /api/invoices/:id/preview` - Preview the client and accountant email content before sending. The `accountant` object includes the configured email, rendered subject/body, default checkbox state, and previous delivery details. Subjects are rendered from their configurable templates.

EUR invoices include `exchangeRate` (CNB rate at issue date) and `totalCzk` (converted CZK equivalent) in responses. These are auto-fetched from the Czech National Bank when the invoice is created or updated. Dashboard totals and paušální daň tracking use the CZK equivalent for EUR invoices.

Invoice item `unit` values are optional. When all item units are empty, generated PDFs omit the quantity/unit column and render a simpler description/price layout.

## Invoice Imports

- `POST /api/invoice-imports/fakturoid/preview` - Validate Fakturoid invoice CSV content and return import counts, row issues, and a ten-invoice preview without writing data
- `POST /api/invoice-imports/fakturoid` - Atomically import valid invoices and create missing contacts. Existing invoices are skipped by invoice number or Fakturoid ID

Both endpoints accept JSON in the form `{ "csv": "..." }`. Imports are limited to 5 MB and 5,000 invoice rows. Proformas, unsupported currencies, invalid rows, and duplicate rows in the same CSV are skipped. Fakturoid invoice exports do not contain item-level data, so each imported invoice receives one synthetic item based on the exported subject while the exact exported subtotal, VAT, and total are preserved.

## Recurring Invoices

- `GET /api/recurring-invoices` - List all recurring invoice templates
- `GET /api/recurring-invoices/:id` - Get template with items
- `POST /api/recurring-invoices` - Create recurring template
- `PUT /api/recurring-invoices/:id` - Update template
- `DELETE /api/recurring-invoices/:id` - Delete template
- `POST /api/recurring-invoices/:id/toggle` - Toggle active/paused
- `POST /api/recurring-invoices/:id/generate-now` - Generate invoice immediately

## Expenses

- `GET /api/expenses` - List expenses (filters: status, clientId, from, to)
- `GET /api/expenses/:id` - Get expense details
- `GET /api/expenses/:id/file` - Download attached file
- `POST /api/expenses` - Create an expense with optional file upload. `paid` defaults to `true`; `amount`, `vatRate`, `vatAmount`, and `total` support exact net/gross VAT amounts.
- `POST /api/expenses/import/preview` - Parse one Alza PDF and return expense fields without saving (`multipart/form-data`, field `file`)
- `POST /api/expenses/import` - Parse and create up to 10 paid Alza expenses independently (`multipart/form-data`, repeated field `files`). Creates an Alza supplier contact by IČO when missing and assigns it to every imported expense. Uses Alza's printed final total including its rounding line.
- `POST /api/expenses/import/universal` - Create up to 10 expenses from structured invoice text (`multipart/form-data`, field `data`) and repeated PDF/JPEG/PNG `files`. Each `FILE` value must exactly match one uploaded filename. All blocks, totals, and file pairings are validated before writes; individual duplicate/database failures are returned in `failed`. See [Universal Invoice Import](universal-invoice-import.md).
- `PUT /api/expenses/:id` - Update a paid or unpaid expense. Supplying `total` preserves that gross value and derives VAT when `vatAmount` is omitted.
- `PATCH /api/expenses/batch` - Set `status` to `paid` or `unpaid` on up to 100 selected expenses. Body: `{ ids: UUID[], status: "paid" | "unpaid" }`
- `POST /api/expenses/batch-download` - Return attached source documents for up to 50 selected expenses as one ZIP archive. Expenses without attachments are omitted; returns 404 if none have attachments. Body: `{ ids: UUID[] }`
- `DELETE /api/expenses/:id` - Delete expense
- `POST /api/expenses/:id/mark-paid` - Mark as paid
- `POST /api/expenses/:id/cancel` - Cancel expense
- `POST /api/expenses/:id/mark-unpaid` - Mark expense as unpaid

## Payments

- `GET /api/payments` - List payments (filter: matched)
- `GET /api/payments/unmatched` - List unmatched payments
- `GET /api/payments/:id/matches` - Get potential invoice matches
- `POST /api/payments/:id/match` - Match to invoice
- `POST /api/payments/:id/unmatch` - Remove match
- `DELETE /api/payments/:id` - Delete unmatched payment
- `POST /api/payments/check-emails` - Check for new payments from email

## ARES

- `GET /api/ares/lookup/:ico` - Lookup company by ICO
- `GET /api/ares/validate/:ico` - Validate ICO checksum

## Dashboard

- `GET /api/dashboard?vatMonths=3` - Get dashboard statistics. `vatMonths` selects 1–12 calendar months and defaults to 3. `vatSummary` contains a CZK estimate for that period: net invoiced revenue, output VAT from issued invoices, input VAT from paid expenses, the estimated balance, and monthly detail. Its `enabled` flag follows the user's VAT-payer setting. Foreign-currency expenses are counted but excluded because expenses do not currently store exchange rates.
- `GET /api/dashboard/quick-stats` - Get quick stats for header

## Settings

- `GET /api/settings` - Get user settings
- `PUT /api/settings` - Update settings, including `emailSubjectTemplate`, `emailTemplate`, `accountantEmail`, `accountantEmailSubjectTemplate`, `accountantEmailTemplate`, and `accountantSendDefault`
- `POST /api/settings/test-smtp` - Test SMTP connection
- `POST /api/settings/test-imap` - Test IMAP connection

Invoice settings include:

- `invoiceNumberPrefix` - optional prefix added before the generated number
- `invoiceNumberFormat` - token template supporting `{YYYY}`, `{YY}`, `{MM}`, `{SEQ}`, `{SEQ2}`, `{SEQ3}`, and `{SEQ4}`
- `invoiceNumberStartingSequence` - starting value used only when the user has no invoices yet
- `invoiceNumberResetPeriod` - `monthly` or `yearly`; controls sequence reset independently of the tokens displayed in the number
- `invoicePdfTemplate` - `classic` or `minimalistic`; classic remains the default
- `defaultExpensePaid` - whether the **Already paid** option is selected for new expenses; defaults to `true`

## AI (Perplexity)

- `GET /api/ai/status` - Check AI feature availability
- `POST /api/ai/match-payment` - AI-powered payment matching
- `POST /api/ai/tax-advisor` - Czech tax advisor chat
