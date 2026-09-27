import { PORTAL_INVOICE_FILTERS, type PortalInvoiceFilter } from "@/lib/validation/portal";
import { listPortalInvoices } from "@/services/portal/billing-service";
import { pageParams, residentRoute } from "../_lib/handler";

/** GET /api/portal/invoices?status=all|unpaid|paid&page= */
export const GET = residentRoute(async ({ req, ctx }) => {
  const status = req.nextUrl.searchParams.get("status");
  const filter: PortalInvoiceFilter = (PORTAL_INVOICE_FILTERS as readonly string[]).includes(status ?? "")
    ? (status as PortalInvoiceFilter)
    : "all";
  return listPortalInvoices(ctx, filter, pageParams(req));
});
