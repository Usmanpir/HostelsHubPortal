import { listSubscriptions } from "@/services/admin/subscription-service";
import { adminRoute, query } from "../_lib/handler";

/** GET /api/admin/subscriptions?status=&planId=&q=&page=&pageSize= */
export const GET = adminRoute(async ({ req, ctx }) => listSubscriptions(ctx, query(req)));
