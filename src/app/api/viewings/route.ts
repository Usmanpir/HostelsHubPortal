import { readJson, searchParamsObject, tenantRoute } from "@/lib/api/handler";
import type { ViewingFilters, ViewingInput } from "@/lib/validation/real-estate";
import { listViewingsGrouped, scheduleViewing } from "@/services/real-estate/viewing-service";

/** GET /api/viewings?leadId=&listingId=&agentUserId=&status=&mine=1 → { today, upcoming, past, needsOutcome } */
export const GET = tenantRoute(async ({ req, ctx }) => listViewingsGrouped(ctx, searchParamsObject(req) as ViewingFilters));

/** POST /api/viewings { leadId, listingId, agentUserId?, date: YYYY-MM-DD, time: HH:mm } — in the org time zone. */
export const POST = tenantRoute(async ({ req, ctx }) => scheduleViewing(ctx, (await readJson(req)) as ViewingInput));
