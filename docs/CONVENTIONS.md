# Engineering conventions

Read this before adding a module. The hostels module (`src/services/hostel`, `src/app/(app)/hostels`,
`src/components/hostels`, `src/app/api/{hostels,floors,rooms,beds}`) is the reference implementation.

## Stack notes (versions matter)

- **Next.js 16** (App Router, Turbopack). `params`/`searchParams`/`cookies()`/`headers()` are **async**.
  Page props use the global `PageProps<"/route/[id]">` type. Middleware is `src/proxy.ts`.
  Read `node_modules/next/dist/docs/` when unsure.
- **Prisma 7** with the `prisma-client` generator. Import from `@/generated/prisma/client`
  (server) or `@/generated/prisma/enums` (enums, safe in client components). DB client: `@/lib/db/prisma`.
- **Zod 4**, React Hook Form 7, TanStack Query 5, Recharts 3, lucide-react, shadcn/ui (radix, `src/components/ui`).
- Tailwind 4 with semantic tokens: `bg-success-soft text-success`, `warning`, `info`, `danger`, `violet`, plus shadcn tokens.
  Use logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`) for RTL readiness.

## Layers

```
page.tsx (server component)  →  service (src/services/**)  →  prisma
client component → server action (app/**/actions.ts) → service
REST route (src/app/api/**)  →  service
```

- **Business logic lives only in services.** Pages, actions and API routes are thin.
- Every service function takes `ctx: TenantContext` first, then input. It must:
  1. `requirePermission(ctx, "x.y")` (keys in `src/lib/permissions/catalog.ts`)
  2. `parseInput(schema, raw)` — never trust input, even from our own forms
  3. scope every query: `scopedWhere(ctx)` for lists (honours the hostel switcher),
     `accessWhere(ctx)` for single records, `assertHostelAccess(ctx, hostelId)` for writes that take a hostelId.
     Never accept `organizationId` from input. Look records up with `{ id, ...accessWhere(ctx) }` and throw
     `NotFoundError` if missing (don't reveal cross-tenant existence).
  4. mutate inside `prisma.$transaction` and call `audit(actorOf(ctx), {...}, tx)` for important changes
     (include `before`/`after` for financial records).
  5. return `serialize(result)` so Decimal → number for client components.
  6. send notifications **after** the transaction (`notifyUsers`, `notifyMembers`, `notifyResident` in `src/lib/notifications/notify.ts`).
- Throw typed errors from `src/lib/errors.ts` (`NotFoundError`, `BusinessRuleError`, `ConflictError`, `ForbiddenError`, `ValidationError`, `PlanLimitError`).
- Plan limits: `assertWithinLimit(prisma, ctx.organizationId, "residents" | "staff" | "beds" | "hostels")` before creating.
- Human-readable numbers: `nextCode(tx, orgId, "resident", "RES")` from `src/lib/sequence.ts`.
- Soft delete: archive via `archivedAt`/status. Never hard-delete residents with history, invoices, payments, assignments, audit logs.

## Server actions

```ts
"use server";
export async function createThingAction(input: ThingInput) {
  return runAction(async () => {
    const thing = await createThing(await tenantOrThrow(), input);
    revalidatePath("/things");
    return { id: thing.id };
  }, "Thing created");
}
```

Client forms use `useActionForm({ schema, defaultValues, action, onSuccess })` with field components from
`src/components/forms/fields.tsx` (`TextField`, `MoneyField`, `SelectField`, `TextareaField`, `SwitchField`,
`CheckboxField`, `FormGrid`, `FormSection`) and `SubmitButton`. Share the Zod schema between client and service
(`src/lib/validation/<module>.ts`). Never use `alert()`; use `toast` (sonner) and `ConfirmAction` dialogs.

## REST API

`src/app/api/<resource>/route.ts` using `tenantRoute(async ({ req, params, ctx }) => service(ctx, …))` from
`src/lib/api/handler.ts`. It handles auth (401), CSRF origin check, rate limiting and error mapping
(`{ error: { code, message, fieldErrors } }`). DELETE = archive/void, never hard delete of history.

## Pages

- `const ctx = await requireTenantPage("perm.key")` at the top of every dashboard page.
- Wrap detail lookups in `loadOr404(getThing(ctx, id))`. Read search params with `sp`, `spNumber`, `spEnum` (`src/lib/page-helpers.ts`).
- `PageHeader` (title, description, breadcrumbs, actions), `StatCard`, `EmptyState`, `EnumBadge`/`StatusBadge`,
  `PageSkeleton` (for `loading.tsx`), `ConfirmAction`, `FormDialog`, `FileUpload`.
- Lists: server-side pagination/filtering via URL. Client `DataTable` (`src/components/data-table/data-table.tsx`)
  gives search, filters, sort, pagination, column visibility, bulk actions and mobile cards. `ExportMenu` for CSV/XLSX
  pointing at an export route that uses `exportResponse()` from `src/lib/export.ts`.
- Client components format with `useFormatters()` (`money`, `date`, `dateTime`) and gate affordances with `useCan()`
  (UI only — services re-check).
- Enum labels/tones: `src/config/labels.ts`. Every screen needs loading, empty and error states.
- Mobile first: stack on small screens, `DataTable` renders cards below `md`.

## Money & dates

- Money columns are `Decimal(12,2)`; do math with `round2`/`toNumber` from `src/lib/serialize.ts`.
- Date-only columns (`@db.Date`) are UTC midnight — create with `dateOnly()` and display with `formatDate()` (UTC).
- Org currency/timezone: `ctx.organization.currency` / `.timezone`; never hard-code a currency.

## Finance model (see `src/services/finance/ledger.ts`)

- Invoice balance = `total − amountPaid`. Receivable statuses: PENDING, PARTIALLY_PAID, OVERDUE.
- Payment types: `PAYMENT` (applied to an invoice), `ADVANCE` (credit; negative rows = credit applied), `REFUND` (cash out).
- Cash collected in a period = Σ PAYMENT + Σ ADVANCE (signed) − Σ REFUND, all with `status: COMPLETED`.
  (Applying credit adds a PAYMENT and a negative ADVANCE, so it nets to zero.)
- Revenue billed = Σ invoice.total for non-DRAFT, non-CANCELLED invoices by issueDate.
