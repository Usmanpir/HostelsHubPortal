import { tenantRoute } from "@/lib/api/handler";
import { listMembers } from "@/services/organization/member-service";

/** GET /api/members — organization members with role and hostel access. */
export const GET = tenantRoute(async ({ ctx }) => listMembers(ctx));
