import { readJson, tenantRoute } from "@/lib/api/handler";
import { generateMonthlyInvoices, previewMonthlyInvoices } from "@/services/finance/monthly-billing-service";
import type { GenerateInvoicesInput } from "@/lib/validation/finance";

/**
 * POST /api/invoices/generate — body: { year, month, hostelId?, applyTax?, preview? }
 * With `preview: true` nothing is written; the response has the count and total that would be billed.
 * Otherwise returns { created, skipped }.
 */
export const POST = tenantRoute(async ({ req, ctx }) => {
  const body = await readJson(req);
  const record = (body && typeof body === "object" ? body : {}) as GenerateInvoicesInput & { preview?: unknown };
  const { preview, ...input } = record;
  return preview === true ? previewMonthlyInvoices(ctx, input) : generateMonthlyInvoices(ctx, input);
});
