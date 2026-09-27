import { tenantRoute } from "@/lib/api/handler";
import { listAssignments } from "@/services/resident/assignment-service";
import { parseAssignmentFilters } from "@/services/resident/filters";

/** GET /api/assignments?status=&from=&to=&hostelId=&q=&page=&pageSize= — stay history */
export const GET = tenantRoute(async ({ req, ctx }) => listAssignments(ctx, parseAssignmentFilters(req.nextUrl.searchParams)));
