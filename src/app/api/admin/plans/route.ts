import { readJson } from "@/lib/api/handler";
import type { PlanInput } from "@/lib/validation/admin";
import { createPlan, listPlans } from "@/services/admin/plan-service";
import { adminRoute } from "../_lib/handler";

/** GET /api/admin/plans */
export const GET = adminRoute(async ({ ctx }) => listPlans(ctx));

/** POST /api/admin/plans — create a plan. */
export const POST = adminRoute(async ({ req, ctx }) => createPlan(ctx, (await readJson(req)) as PlanInput));
