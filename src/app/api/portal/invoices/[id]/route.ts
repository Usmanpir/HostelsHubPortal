import { getPortalInvoice } from "@/services/portal/billing-service";
import { residentRoute } from "../../_lib/handler";

/** GET /api/portal/invoices/:id — one of the resident's own invoices. */
export const GET = residentRoute<{ id: string }>(async ({ params, ctx }) => getPortalInvoice(ctx, params.id));
