import { listUsers } from "@/services/admin/user-service";
import { adminRoute, query } from "../_lib/handler";

/** GET /api/admin/users?q=&status=&role=superadmin&page=&pageSize= */
export const GET = adminRoute(async ({ req, ctx }) => listUsers(ctx, query(req)));
