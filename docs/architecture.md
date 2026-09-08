# Architecture

Essential Invoice is a self-hosted invoicing application for Czech freelancers with a frontend/backend separation.

## Backend (`backend/src/`)

- **Express API** with JWT authentication and rate limiting
- **Entry point**: `index.ts` - Express app setup, middleware, route mounting
- **Routes**: `routes/` - REST endpoints for auth (register, login, forgot-password, reset-password, delete account), clients, invoices, recurring invoices, expenses, payments, settings, ARES lookup, dashboard, AI
- **Services**: `services/` - Business logic:
  - `pdfGenerator.ts` - Invoice PDFs using **pdfmake**, with classic (default, Roboto) and minimalistic (IBM Plex Sans) themes selected by `settings.invoice_pdf_template`. Both support Czech/English labels, QR payments (SPAYD), VAT/non-VAT payers, per-line tax treatments, tax-point dates and grouped VAT breakdowns.
  - `emailSender.ts` - Per-user SMTP email sending for invoice delivery
  - `globalEmailSender.ts` - Global SMTP email sending for system emails (welcome, password reset), configured via env vars
  - `emailPoller.ts` - IMAP polling for bank payment notifications
  - `invoiceDocument.ts` - Owner-scoped export data loading and normalization of stored line taxes
  - `isdocGenerator.ts` - ISDOC 6.0.2 serialization with tax groups, exemption/reverse-charge metadata and CZK/EUR amounts
  - `accountantExport.ts` - Bounded period ZIP packages with CSV summaries, PDFs, ISDOC and expense attachments; exposed through `routes/exports.ts`
  - `recurringInvoiceGenerator.ts` - In-process scheduler (setInterval) that auto-generates invoices from recurring templates, with optional auto-send via SMTP
  - `aiProvider.ts` - AI features via OpenRouter (default: openai/gpt-5.6-luna) or any OpenAI-compatible API: personalized Czech tax advisor, expense extraction from documents, payment reminder drafting
  - `cnbExchangeRate.ts` - CNB (Czech National Bank) exchange rate fetching with DB caching and weekend/holiday fallback. Used to convert EUR invoices and expenses to CZK equivalents for dashboard totals and paušální daň tracking
  - `bankParsers/` - Extensible bank email parsing (Air Bank implemented)
- Supplier registration text is stored as `users.company_register_info`, edited in Profile, and printed by both PDF templates. This supports the business-document disclosures in [Section 435 of the Czech Civil Code](https://www.zakonyprolidi.cz/cs/2012-89#p435); users supply their own applicable registration details.

- **i18n**: `i18n/translations.ts` - Plain TypeScript translation maps (cs/en) for PDF labels and email templates. Services look up translations by the user's `language` column. Backend error messages use language-neutral error codes (e.g., `TOO_MANY_LOGIN_ATTEMPTS`) that the frontend maps to localized strings
- **Utils**: `utils/` - Utility functions:
  - `validation.ts` - Czech IČO validation, IBAN conversion, SPAYD generation
  - `encryption.ts` - AES-256-GCM encryption/decryption for sensitive data at rest (SMTP/IMAP credentials)
  - `logger.ts` - Timestamped logging utility (info, warn, error)
- **Scripts**: `scripts/delete-user.ts` - Admin CLI script to delete a user by email
- **Seed**: `db/seed.ts` - Seeds test data (user, clients, invoices, expenses, payments) for development. Run with `bun run seed [email] [password]`
- **Middleware**: `middleware/auth.ts` - JWT authentication middleware
- **Database**: PostgreSQL with `pg` driver. Schema managed in `db/init.ts` using idempotent CREATE TABLE IF NOT EXISTS and inline ALTER TABLE migrations (no separate migration files). `db/migrate.ts` is the migration runner script. Users table includes `vat_payer` (BOOLEAN, default false) for VAT payer status, `onboarding_completed` (BOOLEAN, default false) to track new-user onboarding, `language` (VARCHAR(5), default 'cs') for locale preference, and `pausalni_dan_enabled`/`pausalni_dan_tier`/`pausalni_dan_limit` for paušální daň settings. `password_reset_tokens` table stores hashed tokens for password reset flow. Invoices and expenses tables both include `exchange_rate` (DECIMAL) and `total_czk` (DECIMAL) for EUR→CZK conversion. `exchange_rates` table caches fetched CNB rates by date and currency.

## Frontend (`frontend/src/`)

- **React** with TypeScript, Vite, and Tailwind CSS; see `frontend/package.json` for current versions
- **Design system ("Calm Indigo")**: semantic colour tokens defined as CSS custom properties in `index.css` (`:root` for light, `.dark` for dark) and mapped to Tailwind names in the same file's `@theme` block — `canvas`, `surface`, `surface-sunken`, `border`, `border-strong`, `hairline`, `hairline-soft`, `text`, `text-secondary`, `text-muted`, `text-faint`, `accent` (with `-hover`, `-soft`, `-tint`, `-quiet`, `-link`), `success`, `success-bg`, `danger`, `danger-bg`, `neutral-chip-bg/fg`, `chart-secondary`, `row-hover`, `nav-hover`. Dark mode is a pure token swap — components carry no `dark:` colour variants. Shared component classes (`card`, `btn*`, `badge*`, `input`, `input-auth`, `label`) live in `index.css`
- **i18n**: react-i18next with 10 namespaces (common, dashboard, invoices, expenses, clients, payments, settings, profile, auth, calculator). Translation JSON files in `i18n/locales/{cs,en}/`. Language selection in Settings persists the choice to the `users.language` column via `PUT /auth/me`, sending the full profile to preserve company fields. Format utilities (`utils/format.ts`) are locale-aware
- **Context**:
  - `context/AuthContext.tsx` - Authentication state management
  - `context/AIContext.tsx` - AI assistant state management
  - `context/ThemeContext.tsx` - Dark/light theme state management
- **Components**: `components/` - Reusable UI:
  - `Layout.tsx` - Main layout wrapper with navigation (desktop sidebar; mobile uses bottom tab bar)
  - `MobileBottomNav.tsx` - Mobile bottom tab bar (Dashboard, Invoices, new-invoice action, Clients, More sheet with secondary navigation, AI assistant, appearance toggle, and logout). The sheet has no Profile entry — the mobile settings index is the only way into it
  - `AIAssistant.tsx` - AI assistant chat component
  - `CommandPalette.tsx` - Global ⌘K/Ctrl+K command palette (mounted in `Layout.tsx`); loads invoices and contacts on open and filters client-side
  - `OfflineBanner.tsx` - Offline state banner driven by the browser `online`/`offline` events
  - `ErrorBoundary.tsx` - Render-error boundary showing the app's own failure state with a reference code; wraps the routed outlet (reset on navigation) and the whole route tree
  - `ReminderComposer.tsx` - Payment-reminder modal with an AI draft and a Friendly/Neutral/Firm tone control; drafts are editable and only sent on an explicit user action
  - `SettingsList.tsx` - Grouped settings-list primitives (group card with inset dividers, row with icon tile / trailing value / toggle, drill-in back header) used by the mobile Settings and Profile indexes
  - `StickySaveBar.tsx` - Save/discard bar for Settings and Profile; hidden until the form differs from its last saved state, then fixed above the mobile tab bar
- **Pages**: `pages/` - Dashboard, Clients, ClientDetail, Invoices, InvoiceCreate, InvoiceDetail, RecurringInvoices, RecurringInvoiceCreate, RecurringInvoiceDetail, Expenses, ExpenseCreate, ExpenseDetail, Payments, Settings, Profile, Calculator, Login, Register, Onboarding, ForgotPassword, ResetPassword
  - `Settings.tsx` / `Profile.tsx`: sections are routes (`/settings/:section`, `/profile/:section`) rather than local state, so mobile can drill in and the browser Back button works. Desktop keeps the two-column `[230px_1fr]` nav + panel; below `lg` the section-less route renders a grouped index instead. The Settings index is the single mobile entry point and includes the profile rows; Language moved from Profile to `/settings/language` and applies immediately, as Appearance does
  - `Dashboard.tsx` revenue chart: hand-rolled bar pairs (no chart library). Months are buttons: hovering shows the tooltip, and tapping pins it until a second tap, a tap outside the plot, Escape, or a year change. The tooltip carries the month's Income, Expenses and Net and is anchored in pixels off a measured wrapper so the edge months stay inside the card; it uses `bg-text`/`text-canvas`, which invert together, so it reads in both themes. The year picker runs oldest→newest with the latest on the right and shows three years at a time, chevrons page further back. The flat-rate tax footnote follows the selected year — a pace projection for the running year, a final in/over verdict for a year that has closed
- **Utils**:
  - `utils/format.ts` - Date/currency formatting helpers
  - `utils/api.ts` - API client and request utilities
- **Path alias**: `@/*` maps to `src/*`

## Helm Chart (`helm-chart/`)

- **Chart.yaml**: Chart metadata (no external dependencies)
- **values.yaml**: All configurable values (backend, frontend, ingress, postgresql, secrets, security contexts, autoscaling, PDBs)
- **templates/**: Kubernetes manifests:
  - `serviceaccount.yaml` - ServiceAccount with configurable annotations (IRSA/Workload Identity)
  - `backend-deployment.yaml` / `frontend-deployment.yaml` - Deployments with security contexts, checksum annotations for auto-rollout, extraEnv/extraEnvFrom support
  - `backend-service.yaml` / `frontend-service.yaml` - Configurable service types
  - `ingress.yaml` - Ingress with configurable pathType and ingressClassName
  - `secret.yaml` - JWT and optional DB password secrets
  - `hpa.yaml` - HorizontalPodAutoscaler (optional, disabled by default)
  - `pdb.yaml` - PodDisruptionBudget (optional, disabled by default)
  - `frontend-configmap.yaml` - Nginx reverse-proxy config and main nginx.conf
  - `postgresql.yaml` - PostgreSQL StatefulSet, Service, and Secret (conditional)
- PostgreSQL deployed via built-in StatefulSet with PVC persistence; can be disabled in favor of external DB
- Ingress disabled by default; supports TLS via cert-manager annotations
- Secrets managed via k8s Secret or existing secret reference
- Security hardened: `runAsNonRoot`, `readOnlyRootFilesystem` (frontend), `drop ALL` capabilities

## Key Integrations

- **ARES API**: Czech company registry lookup by IČO (`routes/ares.ts`)
- **SPAYD**: Czech QR payment code standard for bank transfers
- **Air Bank**: Email notification parsing for automatic payment matching
- **OpenRouter / OpenAI-compatible AI**: Czech tax advisor chat (personalized with the user's tax situation), expense data extraction from uploaded documents, and payment reminder drafting. Defaults to OpenRouter with `openai/gpt-5.6-luna` (web search via `:online` for the tax advisor); users can point it at any OpenAI-compatible API and model (`routes/ai.ts`, `services/aiProvider.ts`)
- **CNB Exchange Rates**: Auto-fetches daily EUR/CZK rates from the Czech National Bank for EUR invoice conversion. Rates are cached in the `exchange_rates` table. Falls back up to 5 days for weekends/holidays (`services/cnbExchangeRate.ts`)

## Security

- All API endpoints (except auth) require JWT authentication
- Passwords are hashed with bcrypt (12 rounds)
- Rate limiting on API endpoints (1,000 requests per IP per 15 minutes; health probes excluded). See the [planned rate-limiting improvements](planned-rate-limiting.md).
- HTTPS recommended for production (configure via reverse proxy)
- Environment-based configuration (no hardcoded secrets)
- Input validation on all endpoints

## Bank Support

Currently supported:
- **Air Bank** - Parses incoming payment notification emails

The bank parsing system is designed to be extensible. To add support for another bank:

1. Create a new parser in `backend/src/services/bankParsers/`
2. Implement the `ParsedPayment` interface
3. Register the parser in `bankParsers/index.ts`

## VAT data and exports

`invoice_items` stores `vat_rate`, `vat_treatment`, `vat_reason`, `vat_code` and allocated `vat_amount`; recurring items store the same tax inputs without calculated VAT. `db/init.ts` backfills legacy invoice rates and allocates the existing recorded VAT without rewriting document totals. Migration is repeatable. The invoice/template header rate remains an API-compatible default.

`utils/money.ts` rounds line bases, computes tax per rate/treatment group, and allocates it cumulatively to invoice lines. Frontend `utils/money.ts` mirrors that calculation for previews; the backend remains authoritative. `InvoiceItemsEditor`, `VatBreakdown`, and `useLineItems` share the editing/display behavior between invoices and recurring templates. Invoice details use `InvoiceDownloadMenu` on desktop and mobile to download PDF or ISDOC directly. `AccountantExport` supplies period/date-basis controls at `/settings/exports`, with its own download form. Invoice editors use a compact per-line VAT selector and reveal special-treatment fields as needed; tax breakdowns are collapsed while editing. Non-VAT payers start new documents at 0%, with controls available on demand; existing taxable lines remain visible.

Exports use current supplier/client profiles and stored invoice amounts. They do not implement immutable party snapshots, filing XML, EU supply modes, ISDOC import, or credit/advance document types. Expenses retain their existing document-level VAT model.

`services/dphPreparation.ts` builds the accountant ZIP's DPH summaries, document register, bilingual review report and guidance from the same owner-scoped documents already loaded by `accountantExport.ts`. It does not query the database or fetch exchange rates. Issued amounts retain per-line stored bases/taxes and use ISDOC's per-line CZK conversion rounding before aggregation; received amounts retain document-level VAT with unreviewed deductibility and unclassified treatment. Missing conversions produce blank register values and explicit excluded-group counts in incomplete summaries. Selection basis, missing fields, classification/deduction review and inconsistent totals are surfaced without inferring filing eligibility. The existing download limits and invoice validation still apply to the whole ZIP.
