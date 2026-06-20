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
- `DELETE /api/invoices/:id` - Delete draft invoice
- `POST /api/invoices/:id/send` - Send via email
- `POST /api/invoices/:id/mark-sent` - Mark as sent manually (without sending email)
- `POST /api/invoices/:id/mark-paid` - Mark as paid
- `POST /api/invoices/:id/cancel` - Cancel invoice
- `GET /api/invoices/:id/preview` - Preview invoice email before sending

EUR invoices include `exchangeRate` (CNB rate at issue date) and `totalCzk` (converted CZK equivalent) in responses. These are auto-fetched from the Czech National Bank when the invoice is created or updated. Dashboard totals and paušální daň tracking use the CZK equivalent for EUR invoices.

Invoice item `unit` values are optional. When all item units are empty, generated PDFs omit the quantity/unit column and render a simpler description/price layout.

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
- `POST /api/expenses` - Create expense with optional file upload
- `PUT /api/expenses/:id` - Update expense
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

- `GET /api/dashboard` - Get dashboard statistics
- `GET /api/dashboard/quick-stats` - Get quick stats for header

## Settings

- `GET /api/settings` - Get user settings
- `PUT /api/settings` - Update settings
- `POST /api/settings/test-smtp` - Test SMTP connection
- `POST /api/settings/test-imap` - Test IMAP connection

Invoice settings include:

- `invoiceNumberPrefix` - optional prefix added before the generated number
- `invoiceNumberFormat` - token template supporting `{YYYY}`, `{YY}`, `{MM}`, `{SEQ}`, `{SEQ2}`, `{SEQ3}`, and `{SEQ4}`
- `invoiceNumberStartingSequence` - starting value used only when the user has no invoices yet
- `invoiceNumberResetPeriod` - `monthly` or `yearly`; controls sequence reset independently of the tokens displayed in the number
- `invoicePdfTemplate` - `classic` or `minimalistic`; classic remains the default

## AI (Perplexity)

- `GET /api/ai/status` - Check AI feature availability
- `POST /api/ai/match-payment` - AI-powered payment matching
- `POST /api/ai/tax-advisor` - Czech tax advisor chat
