import { getPortalDashboard } from "@/services/portal/dashboard-service";
import { residentRoute } from "../_lib/handler";

/** GET /api/portal/dashboard — stay, balance, next due invoice and recent activity. */
export const GET = residentRoute(async ({ ctx }) => getPortalDashboard(ctx));
