import { readJson, searchParamsObject, tenantRoute } from "@/lib/api/handler";
import type { DealFilters, DealInput } from "@/lib/validation/real-estate";
import { createDeal, listDeals } from "@/services/real-estate/deal-service";

/** GET /api/deals?q=&stage=&type=&state=&commission=paid|unpaid&mine=1&agentUserId=&sort=&dir=&page=&pageSize= */
export const GET = tenantRoute(async ({ req, ctx }) => listDeals(ctx, searchParamsObject(req) as DealFilters));

/** POST /api/deals — commissionAmount defaults to agreedAmount × commissionPercent. */
export const POST = tenantRoute(async ({ req, ctx }) => createDeal(ctx, (await readJson(req)) as DealInput));
