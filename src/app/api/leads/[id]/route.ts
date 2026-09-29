import { readJson, tenantRoute } from "@/lib/api/handler";
import type { LeadInput } from "@/lib/validation/real-estate";
import { archiveLead, getLead, updateLead } from "@/services/real-estate/lead-service";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getLead(ctx, params.id));

export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) => updateLead(ctx, params.id, (await readJson(req)) as LeadInput));

/** DELETE archives the lead (activity history is kept). */
export const DELETE = tenantRoute<Params>(async ({ params, ctx }) => {
  await archiveLead(ctx, params.id);
  return null;
});
