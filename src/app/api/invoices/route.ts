import { readJson, tenantRoute } from "@/lib/api/handler";
import { createInvoice, listInvoices } from "@/services/finance/invoice-service";
import { parseInvoiceFilters } from "@/services/finance/filters";
import type { InvoiceInput } from "@/lib/validation/finance";

/** GET /api/invoices?q=&status=&from=&to=&hostel=&residentId=&sort=&dir=&page=&pageSize= */
export const GET = tenantRoute(async ({ req, ctx }) => listInvoices(ctx, parseInvoiceFilters(req.nextUrl.searchParams)));

/** POST /api/invoices — body: InvoiceInput (status "DRAFT" or "PENDING") */
export const POST = tenantRoute(async ({ req, ctx }) => createInvoice(ctx, (await readJson(req)) as InvoiceInput));
