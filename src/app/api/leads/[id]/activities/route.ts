import { readJson, tenantRoute } from "@/lib/api/handler";
import type { LeadActivityInput } from "@/lib/validation/real-estate";
import { addLeadActivity, listLeadActivities } from "@/services/real-estate/lead-service";

type Params = { id: string };

/** GET /api/leads/:id/activities — newest first. */
export const GET = tenantRoute<Params>(async ({ params, ctx }) => listLeadActivities(ctx, params.id));

/** POST /api/leads/:id/activities { type: NOTE|CALL|WHATSAPP|EMAIL|MEETING, body } */
export const POST = tenantRoute<Params>(async ({ req, params, ctx }) => addLeadActivity(ctx, params.id, (await readJson(req)) as LeadActivityInput));
