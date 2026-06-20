# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

### Backend (Express/TypeScript)
```bash
cd backend
bun install             # Install dependencies
bun run dev             # Start dev server with hot reload (bun --watch)
bun run start           # Run production server (runs .ts directly via Bun)
bun run test            # Run tests (use 'bun run test', not 'bun test')
bun run test:watch      # Run tests in watch mode
bun run test:coverage   # Run tests with coverage
```

### Frontend (React/Vite/TypeScript)
```bash
cd frontend
bun install             # Install dependencies
bun run dev             # Start Vite dev server
bun run build           # TypeScript check + Vite build
bun run test            # Run tests (use 'bun run test', not 'bun test')
bun run test:watch      # Run tests in watch mode
bun run test:coverage   # Run tests with coverage
```

### Docker
```bash
docker compose up -d           # Start all services (dev)
docker compose up -d db        # Start only database (for local dev)
docker compose logs backend    # View backend logs
# Production: docker compose -f docker-compose.production.yml up -d
```

### Helm (Kubernetes)
```bash
cd helm-chart
helm lint .                                     # Validate chart
helm template essential-invoice .               # Dry-run render
helm install essential-invoice . \              # Install
  --namespace essential-invoice --create-namespace \
  --set jwtSecret=<secret> --set encryptionKey=$(openssl rand -hex 32) \
  --set postgresql.auth.password=<password>
```

### Database
```bash
cd backend
bun run migrate         # Run database migrations
bun run seed            # Seed test data (default: test@test.com / password123)
bun run seed <email> <password>  # Seed with custom credentials
bun run delete-user <email>  # Delete a user account by email (admin CLI)
```

## Architecture

This is a self-hosted invoicing application for Czech freelancers with frontend/backend separation. See [docs/architecture.md](docs/architecture.md) for full details.

### Backend (`backend/src/`)
- **Express API** with JWT authentication and rate limiting
- **Entry point**: `index.ts` - Express app setup, middleware, route mounting
- **Routes**: `routes/` - REST endpoints for auth (register, login, forgot-password, reset-password, delete account), clients, invoices, recurring invoices, expenses, payments, settings, ARES lookup, dashboard, AI
- **Services**: `services/` - Business logic:
  - `pdfGenerator.ts` - Invoice PDF generation using **pdfmake** library with Czech formatting, QR payment codes (SPAYD), and VAT/non-VAT payer support (hides DIČ and shows "Neplátce DPH" for non-VAT payers, hides DPH line when rate is 0%)
  - `emailSender.ts` - Per-user SMTP email sending for invoice delivery
  - `globalEmailSender.ts` - Global SMTP email sending for system emails (welcome, password reset), configured via env vars
  - `emailPoller.ts` - IMAP polling for bank payment notifications
  - `recurringInvoiceGenerator.ts` - In-process scheduler for auto-generating invoices from recurring templates (monthly), with optional auto-send
  - `perplexityAI.ts` - Perplexity AI integration for tax advice and financial guidance
  - `cnbExchangeRate.ts` - CNB (Czech National Bank) exchange rate fetching with DB caching and weekend/holiday fallback. Converts EUR invoices to CZK for dashboard totals and paušální daň tracking
  - `bankParsers/` - Extensible bank email parsing (Air Bank implemented)
- **i18n**: `i18n/translations.ts` - Plain TypeScript translation maps (cs/en) for PDF labels and email templates. Backend services (pdfGenerator, emailSender, globalEmailSender) use the user's `language` preference to select translations
- **Utils**: `utils/` - Utility functions:
  - `validation.ts` - Czech IČO validation, IBAN conversion, SPAYD generation
  - `encryption.ts` - AES-256-GCM encryption/decryption for sensitive data at rest (SMTP/IMAP credentials)
  - `logger.ts` - Timestamped logging utility (info, warn, error)
- **Scripts**: `scripts/delete-user.ts` - Admin CLI script to delete a user by email
- **Seed**: `db/seed.ts` - Seeds test data (user, clients, invoices, expenses, payments) for development. Run with `bun run seed [email] [password]`
- **Middleware**: `middleware/auth.ts` - JWT authentication middleware
- **Database**: PostgreSQL with `pg` driver. Schema managed in `db/init.ts` using idempotent CREATE TABLE IF NOT EXISTS and inline ALTER TABLE migrations (no separate migration files). `db/migrate.ts` is the migration runner script. Users table includes `vat_payer` (BOOLEAN, default false) for VAT payer status, `onboarding_completed` (BOOLEAN, default false) to track new-user onboarding, `language` (VARCHAR(5), default 'cs') for UI/PDF/email language preference, and `pausalni_dan_enabled`/`pausalni_dan_tier`/`pausalni_dan_limit` for paušální daň settings. The settings table stores configurable token-based invoice numbering (`invoice_number_format`), a first-invoice bootstrap sequence (`invoice_number_starting_sequence`), and an independent monthly/yearly reset policy (`invoice_number_reset_period`). `password_reset_tokens` table stores hashed tokens for password reset flow. `recurring_invoices` and `recurring_invoice_items` tables store monthly recurring invoice templates; `invoices.recurring_invoice_id` tracks which invoices were auto-generated from templates. Invoices table includes `exchange_rate` (DECIMAL) and `total_czk` (DECIMAL) for EUR→CZK conversion at CNB rates. `exchange_rates` table caches fetched CNB rates by date and currency.

### Frontend (`frontend/src/`)
- **React 18** with TypeScript, Vite, and TailwindCSS
- **i18n**: react-i18next with 10 namespaces (common, dashboard, invoices, expenses, clients, payments, settings, profile, auth, calculator). Translation JSON files live in `i18n/locales/{cs,en}/`. Configured in `i18n/i18n.ts`. Format utilities in `utils/format.ts` are locale-aware via `i18n.language`
- **Context**:
  - `context/AuthContext.tsx` - Authentication state management
  - `context/AIContext.tsx` - AI assistant state management
  - `context/ThemeContext.tsx` - Dark/light theme state management
- **Components**: `components/` - Reusable UI:
  - `Layout.tsx` - Main layout wrapper with navigation
  - `ThemeToggle.tsx` - Theme switcher + language picker dropdown (used on auth pages)
  - `AIAssistant.tsx` - AI assistant chat component
- **Pages**: `pages/` - Dashboard, Clients, ClientDetail, Invoices, InvoiceCreate, InvoiceDetail, RecurringInvoices, RecurringInvoiceCreate, RecurringInvoiceDetail, Expenses, ExpenseCreate, ExpenseDetail, Payments, Settings, Profile, Calculator, Login, Register, Onboarding, ForgotPassword, ResetPassword
- **Utils**:
  - `utils/format.ts` - Locale-aware date/currency formatting helpers
  - `utils/api.ts` - API client and request utilities
- **Path alias**: `@/*` maps to `src/*`

### Helm Chart (`helm-chart/`)
- **Chart.yaml**: Chart metadata (no external dependencies)
- **values.yaml**: All configurable values (backend, frontend, ingress, postgresql, secrets, security contexts, autoscaling, PDBs)
- **templates/**: Kubernetes manifests (see [docs/architecture.md](docs/architecture.md) for full list)
- PostgreSQL deployed via built-in StatefulSet with PVC persistence; can be disabled in favor of external DB

### Key Integrations
- **ARES API**: Czech company registry lookup by IČO (`routes/ares.ts`)
- **SPAYD**: Czech QR payment code standard for bank transfers
- **Air Bank**: Email notification parsing for automatic payment matching
- **Perplexity AI**: AI-powered Czech tax advisor, payment matching, and financial insights (`routes/ai.ts`, `services/perplexityAI.ts`)
- **CNB Exchange Rates**: Auto-fetches daily EUR/CZK rates from the Czech National Bank. EUR invoices store `exchange_rate` and `total_czk` for accurate dashboard totals and paušální daň tracking (`services/cnbExchangeRate.ts`)

## Testing

Both projects use Vitest. Tests are co-located with source files (`*.test.ts`).

Run a single test file:
```bash
cd backend && bun vitest run src/utils/validation.test.ts
cd frontend && bun vitest run src/utils/format.test.ts
```

**Important**: Before submitting any code changes:
1. Write comprehensive tests for new functionality
2. Run all tests in both frontend and backend to ensure no regressions:
   ```bash
   cd backend && bun run test
   cd frontend && bun run test
   ```

## Environment

Requires `.env` file in root (copy from `.env.example`). Key variables:
- `JWT_SECRET` - Required for authentication
- `ENCRYPTION_KEY` - Required for encrypting secrets at rest (64-char hex, generate with `openssl rand -hex 32`)
- `DB_*` - PostgreSQL connection settings
- `GLOBAL_SMTP_*` - Global SMTP configuration for system emails (welcome, password reset). Separate from per-user SMTP
- `FRONTEND_URL` - Frontend URL for constructing email links (default: `http://localhost:8080`)
- Per-user SMTP/IMAP configured in-app via Settings page

See [docs/configuration.md](docs/configuration.md) for the full environment variables reference.

## Documentation Maintenance

When making changes to the codebase, update the relevant documentation files:

### Files to Keep Updated
- **CLAUDE.md** - Architecture overview, commands, testing (this file)
- **README.md** - Features list, quick start
- **docs/api-reference.md** - API endpoints
- **docs/architecture.md** - Backend/frontend/helm structure, integrations, security
- **docs/configuration.md** - Environment variables, SMTP/IMAP/AI setup
- **docs/deployment.md** - Docker, Helm, backup procedures
- **docs/development.md** - Local setup, testing, project structure, contributing
- **docs/troubleshooting.md** - Common issues
- **.env.example** - All environment variables with comments
- **helm-chart/** - Helm chart configuration, templates, README, values.yaml, Chart.yaml


### Quick Checklist
- API endpoints changed? → `docs/api-reference.md`
- New pages/routes/services? → CLAUDE.md architecture + `docs/architecture.md`
- New env vars? → `.env.example` + `docs/configuration.md`
- New features? → README.md features list
- Project structure changed? → `docs/development.md`
`
