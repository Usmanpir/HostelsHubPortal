import { z } from "zod";
import { readJson } from "@/lib/api/handler";
import { parseInput } from "@/lib/validation/parse";
import { changeOrganizationPlan, extendTrial, getOrganizationDetail } from "@/services/admin/organization-service";
import { adminRoute } from "../../../_lib/handler";

type Params = { id: string };

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("change_plan"), planId: z.string().max(64), interval: z.enum(["MONTHLY", "YEARLY"]).optional() }),
  z.object({ action: z.literal("extend_trial"), days: z.union([z.number(), z.string()]) }),
]);

/**
 * PATCH /api/admin/organizations/:id/subscription
 *   { action: "change_plan", planId, interval? } | { action: "extend_trial", days }
 */
export const PATCH = adminRoute<Params>(async ({ req, params, ctx }) => {
  const body = parseInput(bodySchema, await readJson(req));
  if (body.action === "change_plan") {
    await changeOrganizationPlan(ctx, params.id, { planId: body.planId, interval: body.interval });
  } else {
    await extendTrial(ctx, params.id, { days: body.days });
  }
  return getOrganizationDetail(ctx, params.id);
});
