import { listPlatformAudit } from "@/services/admin/audit-service";
import { adminRoute, query } from "../_lib/handler";

/** GET /api/admin/audit?q=&scope=all|platform|admin&organizationId=&page=&pageSize= */
export const GET = adminRoute(async ({ req, ctx }) => listPlatformAudit(ctx, query(req)));
