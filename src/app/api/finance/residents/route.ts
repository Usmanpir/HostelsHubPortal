import { tenantRoute } from "@/lib/api/handler";
import { searchBillableResidents } from "@/services/finance/billing-residents";

/**
 * GET /api/finance/residents?q= — resident search for billing forms. Needs
 * invoices.manage or payments.manage (not residents.view) and returns only
 * billing fields: [{ id, name, code, hostelId, hostelName, status }].
 */
export const GET = tenantRoute(async ({ req, ctx }) => searchBillableResidents(ctx, req.nextUrl.searchParams.get("q") ?? ""));
