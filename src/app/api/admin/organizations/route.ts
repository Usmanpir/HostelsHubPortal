import { listOrganizations } from "@/services/admin/organization-service";
import { adminRoute, query } from "../_lib/handler";

/** GET /api/admin/organizations?q=&status=&subscription=&planId=&page=&pageSize= */
export const GET = adminRoute(async ({ req, ctx }) => listOrganizations(ctx, query(req)));
