import { readJson, tenantRoute } from "@/lib/api/handler";
import { changePlan, getBillingOverview } from "@/services/organization/subscription-service";
import type { ChangePlanInput } from "@/lib/validation/settings";

/** GET /api/subscriptions — current subscription, usage vs limits and available plans. */
export const GET = tenantRoute(async ({ ctx }) => getBillingOverview(ctx));

/**
 * POST /api/subscriptions — change plan `{ planKey, interval: "MONTHLY" | "YEARLY" }`.
 * Returns `{ kind: "applied" }` or `{ kind: "redirect", url }` for hosted checkout.
 */
export const POST = tenantRoute(async ({ req, ctx }) => changePlan(ctx, (await readJson(req)) as ChangePlanInput));
