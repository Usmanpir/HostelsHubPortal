import { readJson, tenantRoute } from "@/lib/api/handler";
import { parseInput } from "@/lib/validation/parse";
import { payoutPatchSchema } from "@/lib/validation/owners";
import { cancelPayout, getPayout, markPayoutPaid } from "@/services/owners/payout-service";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getPayout(ctx, params.id));

/**
 * PATCH /api/owners/payouts/:id
 *   { "action": "pay", "paidAt": "YYYY-MM-DD", "paymentMethod": "BANK_TRANSFER", "reference"?, "notes"? }
 *   { "action": "cancel", "reason"? }
 */
export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) => {
  const body = parseInput(payoutPatchSchema, await readJson(req));
  if (body.action === "pay") {
    const { paidAt, paymentMethod, reference, notes } = body;
    return markPayoutPaid(ctx, params.id, { paidAt, paymentMethod, reference, notes });
  }
  return cancelPayout(ctx, params.id, { reason: body.reason });
});
