import { tenantRoute } from "@/lib/api/handler";
import { issueInvoice } from "@/services/finance/invoice-service";

/** POST /api/invoices/:id/issue — DRAFT → PENDING/OVERDUE */
export const POST = tenantRoute<{ id: string }>(async ({ params, ctx }) => issueInvoice(ctx, params.id));
