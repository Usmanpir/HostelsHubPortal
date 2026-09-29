import { readJson, tenantRoute } from "@/lib/api/handler";
import type { DealStageInput } from "@/lib/validation/real-estate";
import { changeDealStage } from "@/services/real-estate/deal-service";

/** POST /api/deals/:id/stage { stage, note? } — CLOSED_WON updates the linked lead and listing. */
export const POST = tenantRoute<{ id: string }>(async ({ req, params, ctx }) => changeDealStage(ctx, params.id, (await readJson(req)) as DealStageInput));
