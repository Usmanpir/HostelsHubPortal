import { readJson, tenantRoute } from "@/lib/api/handler";
import type { CreatePayoutInput } from "@/lib/validation/owners";
import { createPayout, listPayouts } from "@/services/owners/payout-service";
import { parsePayoutFilters } from "@/services/owners/filters";

/** GET /api/owners/payouts?q=&status=&owner=&from=&to=&sort=&dir=&page=&pageSize= */
export const GET = tenantRoute(async ({ req, ctx }) => listPayouts(ctx, parsePayoutFilters(req.nextUrl.searchParams)));

/** POST /api/owners/payouts — body: { ownerId, from, to, adjustments?, notes? } — snapshots the statement */
export const POST = tenantRoute(async ({ req, ctx }) => createPayout(ctx, (await readJson(req)) as CreatePayoutInput));
