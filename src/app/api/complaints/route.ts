import { readJson, searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { createComplaint, listComplaints } from "@/services/operations/complaint-service";
import type { ComplaintFilters, ComplaintInput } from "@/lib/validation/operations";

/** GET /api/complaints?q=&status=&priority=&category=&hostelId=&state=open|closed&sort=&dir=&page=&pageSize= */
export const GET = tenantRoute(async ({ req, ctx }) => listComplaints(ctx, searchParamsObject(req) as ComplaintFilters));

/** POST /api/complaints — { hostelId, category, title, description, … } */
export const POST = tenantRoute(async ({ req, ctx }) => createComplaint(ctx, (await readJson(req)) as ComplaintInput));
