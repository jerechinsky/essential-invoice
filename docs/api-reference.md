# API Reference

All endpoints require JWT authentication unless noted otherwise. Include the token in the `Authorization: Bearer <token>` header.

Requests share a limit of **1,000 requests per IP per 15 minutes**, except `/api/health`. Login additionally permits 10 requests per IP per 15 minutes, and forgot-password permits 5. Exceeding a limit returns HTTP 429 with `Retry-After`; allowances reset automatically. See [request limits and proxies](configuration.md#request-limits-and-proxies).

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

## Clients

- `GET /api/clients` - List all clients (each row also carries `invoiceCount`, `totalPaid`, `totalInvoiced` and `openBalance`, the latter two normalised to CZK for the contacts ranking)
- `GET /api/clients/:id` - Get client details
- `GET /api/clients/:id/invoices` - Get client's invoices
- `POST /api/clients` - Create client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client

## Invoices

- `GET /api/invoices` - List invoices (filters: status, clientId, from, to)
- `GET /api/invoices/:id` - Get invoice with items
- `GET /api/invoices/:id/pdf` - Download PDF
- `GET /api/invoices/:id/isdoc` - Download unsigned ISDOC 6.0.2 XML (CZK/EUR)
- `POST /api/invoices` - Create invoice (items require positive `quantity`, non-negative `unitPrice`; `vatRate` 0–100; `currency` CZK or EUR)
- `PUT /api/invoices/:id` - Update invoice (content edits only on drafts; `status` changes must follow legal transitions: draft→sent/cancelled, sent→paid/overdue/cancelled, overdue→paid/cancelled — paid and cancelled are terminal)
- `DELETE /api/invoices/:id` - Delete draft invoice
- `POST /api/invoices/:id/send` - Send via email (rejected with 400 for `paid` and `cancelled` invoices — a settled invoice must never reach the client again). Accepts optional `customMessage` and `customSubject` overrides (used e.g. by AI-drafted payment reminders)
- `POST /api/invoices/:id/mark-sent` - Mark as sent manually (without sending email)
- `POST /api/invoices/:id/mark-paid` - Mark as paid
- `POST /api/invoices/:id/cancel` - Cancel invoice
- `GET /api/invoices/:id/preview` - Preview invoice email before sending

EUR invoices include `exchangeRate` (CNB rate at issue date) and `totalCzk` (converted CZK equivalent) in responses. These are auto-fetched from the Czech National Bank when the invoice is created or updated. Dashboard totals and paušální daň tracking use the CZK equivalent for EUR invoices.

### Per-line VAT

Invoice and recurring-template items accept `vatRate` (0–100, up to two decimal places), `vatTreatment` (`standard`, `exempt`, `reverse_charge`), `vatReason` (up to 300 characters), and `vatCode` (domestic reverse-charge supply code, up to 20 characters). Omitted line rates inherit the invoice/template `vatRate`; omitted treatment means `standard`. Invoice-level `vatRate` remains the default, not a representation of mixed rates.

Exempt lines require a nonblank reason/legal reference and a zero rate (or no rate). Reverse-charge lines require a numeric supply code, optionally containing a decimal point; their rate records the applicable rate but supplier VAT is zero. Applicability of the chosen treatment/code remains an accounting decision. Standard 0% is distinct from exemption. Invoice responses expose the stored line `vatAmount` and tax-exclusive `total`. The server calculates all monetary totals and ignores submitted line totals/taxes.

Line bases are rounded to two decimal places, grouped by rate and treatment, then VAT is rounded per group. Cumulative allocation distributes group VAT to lines without losing cents. Old single-rate invoices retain their recorded totals during migration. Recurring generation uses the same calculation; the template list includes its calculated `total`.

`deliveryDate` records the tax-point date and defaults to `issueDate`. Include `items` when editing an invoice's VAT default, currency, or issue date, or a recurring template's VAT default. An omitted VAT default on edit preserves the saved default. Recalculation refreshes EUR conversions; switching to CZK clears them.

### Accountant export

`GET /api/exports/accountant?from=2026-09-01&to=2026-09-30&basis=issue` downloads a ZIP. Both ISO calendar dates are required and inclusive; `basis` is `issue` (default) or `tax` (delivery date, falling back to issue date). Maximum range: 367 days; maximum selection: 500 documents and 100 MB of uncompressed files. Each process allows one active export per user.

The package includes sent, overdue and paid invoices plus all expenses in the period. Draft/cancelled invoices and recurring templates are excluded. Files:

- `issued-invoices.csv`: header totals, counterparties, dates, status, currency, stored exchange rate/CZK total, and paths to PDFs/ISDOC.
- `issued-lines.csv`: item quantities/prices, VAT rates, treatments, reasons, supply codes and amounts.
- `issued-vat.csv`: issued bases and VAT grouped per invoice/rate/treatment; currencies remain separate.
- `received-expenses.csv`: expense-level amounts/VAT, supplier data and attachment paths. Input-VAT deductibility is not inferred.
- `issued/`: invoice PDFs and ISDOC files; `received/`: original expense attachments.
- `dph/summary.csv`: CZK bases and recorded VAT by issued/received direction, rate and treatment, with converted/excluded group counts and conversion completeness status.
- `dph/register.csv`: one row per document/rate/treatment, original and CZK amounts, dates and fallback provenance, counterparty, internal and tax-document references, VAT reasons/supply codes, and source file paths relative to the ZIP root. A missing supplier document number stays empty rather than using the internal expense number.
- `dph/issues.csv`: stable issue codes, document IDs/references and Czech/English review messages for missing data, unconfirmed classification/deductibility, special treatments, conversion problems and inconsistent totals.
- `dph/README.txt`: bilingual interpretation, selection and rounding guidance.
- `manifest.json` and `README.txt`: counts, period, selection rules and file-format notes.

CSV uses UTF-8 with BOM, semicolons, quoted cells and decimal points. Formula-like text is prefixed with an apostrophe. Filenames are sanitized and include document IDs. Missing EUR conversions stay empty in expense CSVs. No VAT return/control-statement XML, ISDOC import or ISDOCX is included.

The DPH preparation files use the same document selection and date basis as the main export; issue-date selection is flagged for review. Missing tax-point dates fall back to issue dates and are flagged. Previously auto-filled dates cannot be distinguished from confirmed dates. Expense tax-point dates do not establish a deduction claim period. Received treatment and every document's jurisdiction are `unclassified`; received deduction status is `unreviewed`. Received amounts are **recorded VAT**, not deductible input VAT, and no VAT payable is calculated. Missing counterparty DIČ is a review item, not an assertion that every transaction requires DIČ.

DPH CZK conversion uses the stored positive EUR/CZK rate (1 for CZK), rounding base and VAT separately per invoice line as in ISDOC, or per expense. Summary amounts sum the rounded register amounts, preserving recorded VAT rather than recalculating tax from rates. Missing/invalid rates or malformed groups retain original data but leave CZK amounts blank and exclude the group from CZK sums. Affected summary rows have `czk_totals_status=incomplete` and an `excluded_group_count`; if no group was convertible, sums are blank, not zero. `complete` describes conversion coverage only, not filing readiness. Stored-total mismatches are flagged for review; the register still shows the recorded bases and VAT. Existing invoice/ISDOC validation continues to abort the ZIP on fatal errors, including missing issued-invoice EUR rates. DPH reports do not bypass it.

The manifest is format version 2 and includes `dphPreparation.issueCount`, `excludedGroupCount`, `inputVatDeductibility: "unreviewed"`, and `filingXml: false`. Empty periods still include all DPH files with CSV headers and zero document counts. Review advances, corrective documents, foreign transactions and transactions outside the application separately; the pack does not model them as filing data.

ISDOC uses the official [6.0.2 schema](https://isdoc.github.io/), ordinary invoice document type, CZK local amounts and EUR foreign amounts when applicable. It requires stored totals to reconcile and a valid exchange rate for EUR invoices; failure aborts the package with a specific error rather than silently omitting a document. The standard's supply-code field and VAT note carry domestic reverse charge and exemption reasons. Unknown structured address fields are left empty while preserving the existing free-form address; supplier/client details come from the current profiles, as in PDFs. Downloads do not alter invoice status or send email.

Errors: `400` invalid dates/tax data, missing EUR rate or inconsistent invoice totals; `404` invoice absent/not owned; `409` attachment changed during export; `413` selection too large; `429` another export running. Standard authentication applies to every download; files are sent with `Cache-Control: no-store`.

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
- `POST /api/expenses` - Create expense with optional file upload (EUR expenses store `exchangeRate`/`totalCzk` from the CNB rate on the issue date)
- `PUT /api/expenses/:id` - Update expense
- `DELETE /api/expenses/:id` - Delete expense
- `POST /api/expenses/:id/mark-paid` - Mark as paid
- `POST /api/expenses/:id/cancel` - Cancel expense
- `POST /api/expenses/:id/mark-unpaid` - Mark expense as unpaid

## Payments

- `GET /api/payments` - List payments (filter: matched)
- `GET /api/payments/unmatched` - List unmatched payments
- `GET /api/payments/:id/matches` - Get potential invoice matches
- `POST /api/payments/:id/match` - Match to invoice (payment and invoice currency must match)
- `POST /api/payments/:id/unmatch` - Remove match
- `DELETE /api/payments/:id` - Delete unmatched payment
- `POST /api/payments/check-emails` - Check for new payments from email

## ARES

- `GET /api/ares/lookup/:ico` - Lookup company by ICO
- `GET /api/ares/validate/:ico` - Validate ICO checksum

## Dashboard

- `GET /api/dashboard` - Get dashboard statistics (`stats` includes `outstandingAmount` and `overdueAmount`, both CZK-normalised). `monthlyRevenue` and `monthlyExpenses` cover every month the user has data for (not a rolling window) so the chart's year picker can show whole calendar years; both series are bucketed by payment date and normalised to CZK
- `GET /api/dashboard/quick-stats` - Get quick stats for header

## Settings

- `GET /api/settings` - Get user settings
- `PUT /api/settings` - Update settings
- `POST /api/settings/test-smtp` - Test SMTP connection
- `POST /api/settings/test-imap` - Test IMAP connection

`invoicePdfTemplate` is returned by `GET` and accepted by `PUT`: `classic` (default) or `minimalistic`. Other values return HTTP 400; omitting the field preserves the saved choice. The selection applies to newly generated invoice PDFs, including downloads, email attachments and accountant exports.

## AI

- `GET /api/ai/status` - Check AI feature availability
- `POST /api/ai/tax-advisor` - Czech tax advisor chat (personalized with the user's VAT status, paušální daň settings, and revenue)
- `POST /api/ai/extract-expense` - Extract expense fields from an uploaded document (PDF/JPEG/PNG, max 5MB; returns `extracted` object)
- `POST /api/ai/draft-reminder` - Draft a payment reminder email for a sent/overdue invoice (returns `subject` and `body`). Accepts an optional `tone` of `auto` (default, chosen from how overdue the invoice is), `friendly`, `neutral` or `firm`
