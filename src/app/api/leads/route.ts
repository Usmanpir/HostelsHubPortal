import { readJson, searchParamsObject, tenantRoute } from "@/lib/api/handler";
import type { LeadFilters, LeadInput } from "@/lib/validation/real-estate";
import { createLead, listLeads } from "@/services/real-estate/lead-service";

/** GET /api/leads?q=&stage=&source=&state=&mine=1&followUp=today|overdue|due&assignedUserId=&listingId=&sort=&dir=&page=&pageSize= */
export const GET = tenantRoute(async ({ req, ctx }) => listLeads(ctx, searchParamsObject(req) as LeadFilters));

/** POST /api/leads */
export const POST = tenantRoute(async ({ req, ctx }) => createLead(ctx, (await readJson(req)) as LeadInput));
