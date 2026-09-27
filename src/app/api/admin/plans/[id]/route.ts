import { readJson } from "@/lib/api/handler";
import type { PlanInput } from "@/lib/validation/admin";
import { getPlan, updatePlan } from "@/services/admin/plan-service";
import { adminRoute } from "../../_lib/handler";

type Params = { id: string };

/** GET /api/admin/plans/:id */
export const GET = adminRoute<Params>(async ({ params, ctx }) => getPlan(ctx, params.id));

/** PATCH /api/admin/plans/:id — full plan payload (the key is immutable). */
export const PATCH = adminRoute<Params>(async ({ req, params, ctx }) => updatePlan(ctx, params.id, (await readJson(req)) as PlanInput));
