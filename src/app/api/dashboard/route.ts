import { tenantRoute } from "@/lib/api/handler";
import { getDashboardSummary } from "@/services/dashboard/dashboard-service";

/** GET /api/dashboard — KPIs, charts and activity for the current hostel scope. */
export const GET = tenantRoute(async ({ ctx }) => getDashboardSummary(ctx));
