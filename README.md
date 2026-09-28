# HostelHub — Multi-Tenant Hostel Management SaaS

A production-grade SaaS for hostel owners, property managers, student accommodation, PG and worker/dormitory
operators. One organization manages **many hostels → floors → rooms → beds → residents**, plus staff, billing,
operations, reports and a resident self-service portal — with strict tenant isolation and role-based access.

---

## Features

| Area | What you get |
| --- | --- |
| **Multi-tenancy** | Organizations (tenants) with members, per-org roles, hostel-level access, header hostel switcher (no re-login) |
| **Property** | Hostels, floors, rooms (bulk create), beds as entities, interactive colour-coded room map with filters |
| **Residents** | Full profiles, secure documents, stay history, check-in / check-out wizards, room & bed transfers, reservations, portal access |
| **Staff** | Staff records & documents, multi-hostel assignment, daily attendance + monthly calendar, leave, payroll with payslips |
| **Billing** | Invoices with line items, tax & discounts, monthly bulk billing, payments & printable receipts, advance credit, refunds, expenses |
| **Operations** | Maintenance requests (photos, assignment), complaints, visitor log (check-in/out), announcements with targeting, staff task list |
| **Dashboards & reports** | Owner dashboard (occupancy, revenue, collections, expenses, hostel comparison), finance overview, 15 reports with CSV/Excel export and print-to-PDF |
| **Resident portal** | Own room, invoices, payments/receipts, complaints, maintenance requests, announcements, room-change/leave requests |
| **SaaS** | Plans (Trial/Starter/Business/Enterprise), limits & usage, trials, provider-agnostic billing abstraction, super-admin panel, feature flags |
| **Platform** | Audit log (with before/after for financial changes), notification center (in-app + email; SMS/WhatsApp-ready), global search, white-label branding, i18n/RTL-ready |

## Tech stack

- **Next.js 16** (App Router, Server Components, Server Actions, Route Handlers, Turbopack) · **React 19** · **TypeScript (strict)**
- **Tailwind CSS 4** · **shadcn/ui** (Radix) · **Lucide** · **Recharts 3** · **TanStack Query 5**
- **React Hook Form** + **Zod 4** (same schemas validate on client and server)
- **PostgreSQL 16** · **Prisma 7** (driver adapter `@prisma/adapter-pg`)
- **Auth.js v5** (credentials, JWT session cookie re-validated against the DB each request) · **bcrypt**
- **S3-compatible storage** (AWS S3, Cloudflare R2, MinIO…) with a local-disk driver for development
- **Vitest** integration tests against a real PostgreSQL test database

## Requirements

- Node.js **20.9+** (22 LTS recommended), npm 10+
- Docker (for the local PostgreSQL) — or any PostgreSQL 14+ connection string

## Getting started (development)

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # then set AUTH_SECRET (npx auth secret) and CRON_SECRET
npm run db:up               # starts PostgreSQL 16 on localhost:5440 (+ creates the test database)
npm run db:migrate          # applies migrations to the dev database
npm run db:seed             # loads demo data (see credentials below)
npm run dev                 # http://localhost:3000
```

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `TEST_DATABASE_URL` | tests | Separate database for integration tests (name must contain `test`) |
| `AUTH_SECRET` | yes | Secret for signing session cookies (`npx auth secret`) |
| `NEXTAUTH_URL` / `AUTH_URL` | yes (prod) | Public base URL |
| `AUTH_TRUST_HOST` | non-Vercel | `true` when behind a trusted proxy |
| `NEXT_PUBLIC_APP_URL` | yes | Base URL used in emails (invites, password resets) |
| `NEXT_PUBLIC_APP_NAME` | no | Platform brand name (default `HostelHub`) |
| `STORAGE_DRIVER` | yes | `local` (dev only) or `s3` |
| `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET` | when `s3` | S3-compatible bucket (keep it **private**) |
| `STORAGE_MAX_FILE_MB` | no | Upload size limit (default 10) |
| `EMAIL_SERVER` | prod | SMTP URL, e.g. `smtp://user:pass@smtp.example.com:587`. Empty = emails are logged to the console |
| `EMAIL_FROM` | prod | Default sender |
| `REQUIRE_EMAIL_VERIFICATION` | no | `true` to block sign-in until the email is verified |
| `CRON_SECRET` | prod | Bearer secret for `/api/cron/daily` |
| `SALES_EMAIL` | no | Inbox for "Book a demo" requests (defaults to `EMAIL_FROM`) |

### Database

```bash
npm run db:migrate      # prisma migrate dev — create/apply migrations in development
npm run db:deploy       # prisma migrate deploy — apply migrations in production/CI
npm run db:seed         # prisma db seed — demo data (development only)
npm run db:studio       # Prisma Studio
```

### Demo credentials (development seed only)

All demo accounts use the password **`Demo@12345`**. Never use these in production — the seed refuses to run when `NODE_ENV=production`.

| Role | Email | Notes |
| --- | --- | --- |
| Super admin | `admin@hostelhub.dev` | Platform admin panel at `/admin` |
| Owner | `owner@demo-hostels.dev` | Organization "Demo Hostel Management" |
| Admin | `manager@demo-hostels.dev` | All hostels |
| Accountant | `accounts@demo-hostels.dev` | Finance only, no resident management |
| Hostel manager | `islamabad.manager@demo-hostels.dev` | Islamabad Boys Hostel only |
| Receptionist | `reception@demo-hostels.dev` | Rawalpindi Hostel only |
| Warden | `warden@demo-hostels.dev` | Islamabad Boys Hostel only |
| Staff | `staff@demo-hostels.dev` | "My tasks" view |
| Resident | `resident@demo-hostels.dev` | Resident portal at `/portal` |
| Other tenant owner | `owner@other-tenant.dev` | Separate organization — used to verify isolation |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` + production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Route type generation + `tsc --noEmit` |
| `npm test` | Integration tests (needs `TEST_DATABASE_URL`) |
| `node scripts/smoke.mjs` | End-to-end smoke test of every role against a running, seeded server (`BASE_URL=…`) |

## Architecture

```
src/
  app/
    (marketing)/          landing page
    (auth)/               login, register, forgot/reset password, verify email
    invite/[token]/       invitation acceptance
    onboarding/           7-step setup wizard
    (app)/                authenticated tenant app (sidebar shell)
      dashboard/ hostels/ residents/ staff/ finance/ operations/ reports/ audit-log/ settings/ tasks/ account/
    portal/               resident portal
    admin/                super-admin panel
    api/                  REST route handlers (auth, hostels, floors, rooms, beds, residents, assignments, staff,
                          attendance, leave, payroll, invoices, payments, expenses, maintenance, complaints, visitors,
                          announcements, reports, dashboard, organizations, members, roles, subscriptions, files,
                          notifications, search, portal, admin, cron)
  services/               business logic (one folder per domain) — the only layer that talks to Prisma
  lib/
    auth/ db/ permissions/ tenant/ validation/ storage/ notifications/ subscription/ security/ i18n/
  components/             ui/ (shadcn), shared/, forms/, data-table/, layout/, and one folder per module
  config/                 navigation, enum labels, plans, defaults
prisma/                   schema.prisma, migrations, seed.ts
tests/                    Vitest integration tests
docs/CONVENTIONS.md       how to add a module
```

Request flow: **page / server action / API route → service → Prisma**. Pages and routes are thin; services validate
input with Zod, authorize, scope queries to the tenant, run mutations in transactions, write audit entries and return
serialized data. See [docs/CONVENTIONS.md](docs/CONVENTIONS.md).

## Multi-tenancy

- Every tenant-owned table has `organizationId` (and hostel-owned tables also `hostelId`), with composite indexes for
  tenant-scoped queries.
- The server builds a `TenantContext` for every request from the **authenticated user id + database**
  (`src/lib/tenant/context.ts`): organization, membership, role permissions, accessible hostels, active hostel.
  Cookies only carry *preferences* (active organization / hostel), which are validated against memberships and access.
- `organizationId`, roles and hostel ids are **never trusted from the client**. Services look records up with
  `{ id, ...accessWhere(ctx) }`, and list queries use `scopedWhere(ctx)`; a foreign id yields **404**, so the existence
  of other tenants' records is not revealed.
- Uploaded files are private: bytes live in storage under an org-prefixed key and are only served via
  `/api/files/[id]` after checking the viewer may see the record the file belongs to.
- The test suite includes explicit cross-tenant attacks (`tests/tenant-isolation.test.ts`).

## RBAC

- **System role**: `SUPER_ADMIN` (`User.isSuperAdmin`) — platform panel only; it has no implicit access to tenant data.
- **Organization roles** are rows in `Role` with granular permission keys (`RolePermission`), seeded per organization from
  templates: Owner, Admin, Accountant, Hostel Manager, Receptionist, Warden, Staff. Owners can edit them and create
  custom roles. Code checks **permissions**, never role names (`src/lib/permissions/catalog.ts`).
- **Hostel scope**: a member has either all-hostel access or a list of hostels (`MemberHostelAccess`). Hostel-level
  staff can only read or write records of their hostels.
- **Residents** sign in to the portal; every portal query is bound to their own resident id.
- The UI hides what you can't do, but every check is enforced again in services.

## Key business rules (enforced in services + database)

1. A bed cannot have two live residents — `ResidentAssignment.activeBedId` is `UNIQUE`, set only while reserved/active, and the bed row is locked (`FOR UPDATE`) during check-in/transfer.
2. A resident cannot have two live assignments — `activeResidentId` is `UNIQUE`.
3. Rooms cannot exceed capacity (bed creation and check-in both check it).
4. Checked-out residents have no live assignment; check-out frees the bed and recomputes room status.
5. Payments cannot exceed the invoice balance unless explicitly recorded as advance credit; invoice rows are locked during payment.
6. Financial records are never deleted — invoices are cancelled, payments/expenses voided, with a reason and an audit entry (before/after).
7. Archived residents/hostels remain in historical reports.
8. Plan limits (hostels, beds, residents, staff, storage) are enforced on creation.

## Testing

```bash
npm run db:up
npm test
```

Integration tests run against `TEST_DATABASE_URL` (migrations applied automatically, each test creates isolated
tenants). Coverage includes authentication, authorization/RBAC, tenant isolation, resident creation, bed assignment,
room transfers, check-in/check-out, invoices, payments (incl. concurrent overpayment), expenses and staff permissions.

## Production deployment (Vercel)

1. Provision PostgreSQL (Neon, Supabase, RDS…) and a **private** S3-compatible bucket.
2. Set the environment variables above in Vercel (`STORAGE_DRIVER=s3`, SMTP settings, `CRON_SECRET`).
3. Build command `npm run build` (default). Run `npm run db:deploy` against the production database (e.g. as a
   release step or from CI) — never run the seed in production.
4. `vercel.json` schedules `/api/cron/daily` (overdue invoices, rent-due reminders, housekeeping).
5. Create the first super admin by registering and then setting `isSuperAdmin = true` on that user in the database.

## Security considerations

- bcrypt (cost 12) password hashing; constant-time login for unknown emails; account lockout after 5 failures;
  DB-backed rate limits on login, registration, password reset, uploads and API mutations.
- Session cookies are HttpOnly/SameSite=Lax; sessions are re-validated against the DB and revocable (`sessionVersion`).
- CSRF: Server Actions verify origin; REST mutations check `Origin` against the host.
- All input validated with Zod on the server; Prisma parameterizes all SQL; React escapes output.
- Uploads: magic-byte type detection (PDF/JPEG/PNG/WebP), size limits, per-plan storage quota, random keys, private storage.
- Security headers (HSTS, frame-deny, nosniff, referrer and permissions policies); stack traces never reach clients.
- CSV/Excel exports neutralize formula injection.

## Extensibility

- **Notifications**: implement `NotificationChannel` (`src/lib/notifications/channels.ts`) for SMS/WhatsApp.
- **SaaS billing**: implement `BillingProvider` (`src/lib/subscription/provider.ts`) for Stripe/Paddle; no provider logic elsewhere.
- **Storage**: implement `StorageProvider` (`src/lib/storage/types.ts`).
- **i18n**: add `src/lib/i18n/messages/<locale>.ts`; RTL direction is derived from the locale; layouts use logical CSS properties.
- **White-label**: organization brand name, logo, primary colour, custom domain and email sender fields are in place.
#   H o s t e l s H u b P o r t a l  
 