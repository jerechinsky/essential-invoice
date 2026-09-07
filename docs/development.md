# Development

## Prerequisites

- [Bun](https://bun.sh/) runtime
- Docker and Docker Compose (for PostgreSQL)
- `xmllint` for ISDOC schema tests (included on macOS; `sudo apt-get install libxml2-utils` on Debian/Ubuntu)

## Local Development Setup

Agents should read [AGENTS.md](../AGENTS.md) for the shared repository instructions. `CLAUDE.md` points to that file so the guidance stays in sync.

**Important:** For local development, the frontend runs on port 5173 (Vite default).
Compose reads the root `.env`; direct Bun commands from `backend/` use `backend/.env`.

1. Create a root `.env` from `.env.example` if it does not exist and configure database credentials, then start the database:
```bash
docker compose up -d db
```

2. Backend:
```bash
cd backend
bun install
# If backend/.env does not exist, copy ../.env.example to .env
# Set DB_HOST=localhost and match the root .env database credentials/port.
# Set CORS_ORIGIN=http://localhost:5173 and FRONTEND_URL=http://localhost:5173.
# Configure JWT_SECRET and ENCRYPTION_KEY before starting the API.
bun run dev
```

3. Frontend:
```bash
cd frontend
bun install
bun run dev
```

## Running Tests

Both backend and frontend use Vitest (`bun run test`, not `bun test`). Tests are co-located with source files: backend `*.test.ts`, frontend `*.test.ts` and `*.test.tsx`.

**Backend tests:**
```bash
cd backend
bun run test              # Run all tests
bun run test:watch        # Watch mode
bun run test:coverage     # With coverage report
```

**Frontend tests:**
```bash
cd frontend
bun run test              # Run all tests
bun run test:watch        # Watch mode
bun run test:coverage     # With coverage report
```

Run a single test file:
```bash
(cd backend && bun run test src/utils/validation.test.ts)
(cd frontend && bun run test src/utils/format.test.ts)
```

Before submitting code changes, run both suites. For frontend changes, also run `(cd frontend && bun run build)` from the repository root to check TypeScript and the production bundle. Documentation-only changes need link/path/command checks and `git diff --check`.

**Test coverage includes:**
- Air Bank email parsing (incoming payment detection, field extraction)
- Bank parser factory (bank detection, payment parsing)
- Validation utilities (IČO checksum, email, currency formatting, SPAYD)
- API routes (authentication, authorization, validation)
- Mixed-rate VAT rounding, tax treatment validation, and export access controls
- ISDOC CZK/EUR fixtures validated against the bundled official XSD; ZIP contents and CSV escaping
- Frontend utilities (date/currency formatting, status labels)

### Pull request CI

On pull requests, `.github/workflows/test.yml` runs backend and/or frontend tests based on changed paths (`backend/**`, `frontend/**`). A single **Tests** check aggregates the results so branch protection can require one status.

## Admin Scripts

### Seed Test Data

Seed a test user with clients, invoices, expenses, and payments for development:
```bash
cd backend
bun run seed                           # Default: test@test.com / password123
bun run seed user@example.com mypass   # Custom credentials
```
The script refuses to run if the user already exists. Use `bun run delete-user` to remove them first.

### Delete User

Delete a user and all associated data (invoices, clients, expenses, payments, settings) by email:
```bash
cd backend
bun run delete-user user@example.com
```
The script will show user details and prompt for confirmation before deleting.

## Project Structure

```
essential-invoice/
├── backend/
│   ├── src/
│   │   ├── db/              # Database init (init.ts), migrations (migrate.ts), seed (seed.ts)
│   │   ├── middleware/      # Auth middleware (auth.ts)
│   │   ├── routes/          # API routes (auth, clients, invoices, expenses, payments, settings, ares, dashboard, ai)
│   │   ├── i18n/             # Backend translations (translations.ts) for PDFs and emails
│   │   ├── services/        # Business logic
│   │   │   ├── bankParsers/ # Bank email parsers (Air Bank)
│   │   │   ├── emailPoller.ts
│   │   │   ├── emailSender.ts       # Per-user SMTP for invoices
│   │   │   ├── globalEmailSender.ts  # Global SMTP for system emails
│   │   │   ├── pdfGenerator.ts       # Uses pdfmake library
│   │   │   └── aiProvider.ts        # OpenRouter / OpenAI-compatible AI client
│   │   ├── scripts/          # Admin CLI scripts (delete-user.ts)
│   │   ├── utils/           # Validation utilities (IČO, IBAN, SPAYD)
│   │   └── index.ts         # Express app entry point
│   ├── uploads/             # File uploads (logos, expense attachments)
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # Layout, AIAssistant
│   │   ├── context/         # AuthContext, AIContext
│   │   ├── i18n/            # react-i18next config + locales/{cs,en}/*.json
│   │   ├── pages/           # Dashboard, Clients, ClientDetail, Invoices, InvoiceCreate, InvoiceDetail,
│   │   │                    # Expenses, ExpenseCreate, ExpenseDetail, Payments, Settings, Profile,
│   │   │                    # Calculator, Login, Register, Onboarding, ForgotPassword, ResetPassword
│   │   ├── utils/           # API client, formatting helpers
│   │   └── test/            # Test setup (Vitest/jsdom)
│   ├── Dockerfile
│   ├── nginx.conf           # Production Nginx config
│   └── package.json
├── docs/                    # Detailed documentation
├── .github/workflows/       # CI/CD (PR tests, Docker build, chart publish)
├── helm-chart/              # Helm chart (see helm-chart/README.md)
├── docker-compose.yml
├── docker-compose.production.yml
├── .env.example
├── AGENTS.md                # Shared repository instructions for agents
├── CLAUDE.md                # Points to AGENTS.md
└── README.md
```

## Adding Translations (i18n)

### Frontend

Frontend translations use react-i18next with JSON files organized by namespace:

```
frontend/src/i18n/locales/
├── cs/
│   ├── common.json
│   ├── dashboard.json
│   ├── invoices.json
│   ├── expenses.json
│   ├── clients.json
│   ├── payments.json
│   ├── settings.json
│   ├── profile.json
│   ├── auth.json
│   └── calculator.json
└── en/
    └── (same files)
```

To add a new translation key:
1. Add the key to the appropriate namespace JSON file in both `cs/` and `en/`
2. Use it in components with `const { t } = useTranslation('namespace')` then `t('key')`

To add a new namespace:
1. Create `<namespace>.json` in both `cs/` and `en/` locale directories
2. Register the namespace in `frontend/src/i18n/i18n.ts`

### Backend

Backend translations live in `backend/src/i18n/translations.ts` as plain TypeScript objects keyed by language code. These are used by PDF generation and email templates. Add new keys to both `cs` and `en` entries.

Backend error messages use language-neutral error codes (e.g., `TOO_MANY_LOGIN_ATTEMPTS`) rather than human-readable strings. The frontend maps these codes to localized messages.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

When contributing code changes, **always update the documentation** to reflect your changes:

1. **Added a new feature?** - Update README.md features, add API endpoints to `docs/api-reference.md`, update `docs/architecture.md`
2. **Changed existing behavior?** - Update the relevant docs files
3. **Added configuration options?** - Add to `.env.example` and `docs/configuration.md`
4. **Changed dependencies?** - Update the corresponding `bun.lock` and affected documentation; update `AGENTS.md` if commands or conventions change

**Documentation is part of your contribution.** PRs with outdated documentation may be rejected.
