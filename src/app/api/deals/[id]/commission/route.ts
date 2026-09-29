import { readJson, tenantRoute } from "@/lib/api/handler";
import type { DealCommissionInput } from "@/lib/validation/real-estate";
import { setDealCommissionPaid } from "@/services/real-estate/deal-service";

/** POST /api/deals/:id/commission { paid: boolean, paidOn?: YYYY-MM-DD } */
export const POST = tenantRoute<{ id: string }>(async ({ req, params, ctx }) =>
  setDealCommissionPaid(ctx, params.id, (await readJson(req)) as DealCommissionInput),
);
