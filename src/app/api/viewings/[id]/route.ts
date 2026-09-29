import { readJson, tenantRoute } from "@/lib/api/handler";
import type { ViewingOutcomeInput, ViewingRescheduleInput } from "@/lib/validation/real-estate";
import { getViewing, recordViewingOutcome, rescheduleViewing } from "@/services/real-estate/viewing-service";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getViewing(ctx, params.id));

/** PATCH /api/viewings/:id { date, time, agentUserId? } — reschedule. */
export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) => rescheduleViewing(ctx, params.id, (await readJson(req)) as ViewingRescheduleInput));

/** POST /api/viewings/:id { status: COMPLETED|CANCELLED|NO_SHOW, feedback? } — record the outcome. */
export const POST = tenantRoute<Params>(async ({ req, params, ctx }) => recordViewingOutcome(ctx, params.id, (await readJson(req)) as ViewingOutcomeInput));
