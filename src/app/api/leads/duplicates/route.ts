import { searchParamsObject, tenantRoute } from "@/lib/api/handler";
import type { LeadDuplicateInput } from "@/lib/validation/real-estate";
import { findDuplicateLeads } from "@/services/real-estate/lead-service";

/** GET /api/leads/duplicates?phone=&email=&excludeId= — open leads with the same phone or email. */
export const GET = tenantRoute(async ({ req, ctx }) => findDuplicateLeads(ctx, searchParamsObject(req) as LeadDuplicateInput));
