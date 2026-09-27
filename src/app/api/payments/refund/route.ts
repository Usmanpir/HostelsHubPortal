import { readJson, tenantRoute } from "@/lib/api/handler";
import { recordRefund } from "@/services/finance/payment-service";
import type { RefundInput } from "@/lib/validation/finance";

/** POST /api/payments/refund — body: RefundInput */
export const POST = tenantRoute(async ({ req, ctx }) => recordRefund(ctx, (await readJson(req)) as RefundInput));
