# Architecture

Essential Invoice is a self-hosted invoicing application for Czech freelancers with a frontend/backend separation.

## Backend (`backend/src/`)

- **Express API** with JWT authentication and rate limiting
- **Entry point**: `index.ts` - Express app setup, middleware, route mounting
- **Routes**: `routes/` - REST endpoints for auth (register, login, forgot-password, reset-password, delete account), clients, invoices, recurring invoices, expenses, payments, settings, ARES lookup, dashboard, AI
- **Services**: `services/` - Business logic:
  - `pdfGenerator.ts` - Invoice PDF generation using **pdfmake** library with Czech formatting, selectable classic/minimalistic templates, QR payment codes (SPAYD), VAT/non-VAT payer support (hides DIČ and shows "Neplátce DPH" for non-VAT payers, hides DPH line when rate is 0%), optional company registry footer text, and simplified layouts for invoices without item units
  - `emailSender.ts` - Per-user SMTP email sending for invoice delivery
  - `globalEmailSender.ts` - Global SMTP email sending for system emails (welcome, password reset), configured via env vars
  - `emailPoller.ts` - IMAP polling for bank payment notifications
  - `recurringInvoiceGenerator.ts` - In-process scheduler (setInterval) that auto-generates invoices from recurring templates, with optional auto-send via SMTP
  - `perplexityAI.ts` - Perplexity AI integration for tax advice and financial guidance
  - `cnbExchangeRate.ts` - CNB (Czech National Bank) exchange rate fetching with DB caching and weekend/holiday fallback. Used to convert EUR invoices to CZK equivalents for dashboard totals and paušální daň tracking
  - `bankParsers/` - Extensible bank email parsing (Air Bank implemented)
- **i18n**: `i18n/translations.ts` - Plain TypeScript translation maps (cs/en) for PDF labels and email templates. Services look up translations by the user's `language` column. Backend error messages use language-neutral error codes (e.g., `TOO_MANY_LOGIN_ATTEMPTS`) that the frontend maps to localized strings
- **Utils**: `utils/` - Utility functions:
  - `validation.ts` - Czech IČO validation, IBAN conversion, SPAYD generation
  - `encryption.ts` - AES-256-GCM encryption/decryption for sensitive data at rest (SMTP/IMAP credentials)
  - `logger.ts` - Timestamped logging utility (info, warn, error)
- **Scripts**: `scripts/delete-user.ts` - Admin CLI script to delete a user by email
- **Seed**: `db/seed.ts` - Seeds test data (user, clients, invoices, expenses, payments) for development. Run with `bun run seed [email] [password]`
- **Middleware**: `middleware/auth.ts` - JWT authentication middleware
- **Database**: PostgreSQL with `pg` driver. Schema managed in `db/init.ts` using idempotent CREATE TABLE IF NOT EXISTS and inline ALTER TABLE migrations (no separate migration files). `db/migrate.ts` is the migration runner script. Users table includes `vat_payer` (BOOLEAN, default false) for VAT payer status, `onboarding_completed` (BOOLEAN, default false) to track new-user onboarding, `language` (VARCHAR(5), default 'cs') for locale preference, and `pausalni_dan_enabled`/`pausalni_dan_tier`/`pausalni_dan_limit` for paušální daň settings. The settings table stores token-based invoice numbering in `invoice_number_format`, the first-invoice bootstrap value in `invoice_number_starting_sequence`, and the independent monthly/yearly reset policy in `invoice_number_reset_period`. `password_reset_tokens` table stores hashed tokens for password reset flow. Invoices table includes `exchange_rate` (DECIMAL) and `total_czk` (DECIMAL) for EUR→CZK conversion. `exchange_rates` table caches fetched CNB rates by date and currency.

## Frontend (`frontend/src/`)

- **React 18** with TypeScript, Vite, and TailwindCSS
- **i18n**: react-i18next with 10 namespaces (common, dashboard, invoices, expenses, clients, payments, settings, profile, auth, calculator). Translation JSON files in `i18n/locales/{cs,en}/`. Language switcher on the Profile page persists the choice to the `users.language` column via `PUT /auth/me`. Format utilities (`utils/format.ts`) are locale-aware
- **Context**:
  - `context/AuthContext.tsx` - Authentication state management
  - `context/AIContext.tsx` - AI assistant state management
  - `context/ThemeContext.tsx` - Dark/light theme state management
- **Components**: `components/` - Reusable UI:
  - `Layout.tsx` - Main layout wrapper with navigation
  - `AIAssistant.tsx` - AI assistant chat component
- **Pages**: `pages/` - Dashboard, Clients, ClientDetail, Invoices, InvoiceCreate, InvoiceDetail, RecurringInvoices, RecurringInvoiceCreate, RecurringInvoiceDetail, Expenses, ExpenseCreate, ExpenseDetail, Payments, Settings, Profile, Calculator, Login, Register, Onboarding, ForgotPassword, ResetPassword
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
- **Perplexity AI**: AI-powered Czech tax advisor, payment matching, and financial insights (`routes/ai.ts`, `services/perplexityAI.ts`)
- **CNB Exchange Rates**: Auto-fetches daily EUR/CZK rates from the Czech National Bank for EUR invoice conversion. Rates are cached in the `exchange_rates` table. Falls back up to 5 days for weekends/holidays (`services/cnbExchangeRate.ts`)

## Security

- All API endpoints (except auth) require JWT authentication
- Passwords are hashed with bcrypt (12 rounds)
- Rate limiting on API endpoints (100 requests/15 min)
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
