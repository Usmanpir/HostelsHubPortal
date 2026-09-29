import { readJson, tenantRoute } from "@/lib/api/handler";
import type { LeadStageInput } from "@/lib/validation/real-estate";
import { changeLeadStage } from "@/services/real-estate/lead-service";

/** POST /api/leads/:id/stage { stage, lostReason? } — lostReason is required for LOST. */
export const POST = tenantRoute<{ id: string }>(async ({ req, params, ctx }) => changeLeadStage(ctx, params.id, (await readJson(req)) as LeadStageInput));
