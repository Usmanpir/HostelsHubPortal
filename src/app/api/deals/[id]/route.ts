import { readJson, tenantRoute } from "@/lib/api/handler";
import type { DealInput } from "@/lib/validation/real-estate";
import { getDeal, updateDeal } from "@/services/real-estate/deal-service";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getDeal(ctx, params.id));

/** PATCH /api/deals/:id — open deals only. Deals are financial history and are never deleted. */
export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) => updateDeal(ctx, params.id, (await readJson(req)) as DealInput));
