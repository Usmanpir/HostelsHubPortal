import { getPlatformOverview } from "@/services/admin/overview-service";
import { adminRoute } from "../_lib/handler";

/** GET /api/admin/overview — platform counts, MRR estimate, growth and system activity. */
export const GET = adminRoute(async ({ ctx }) => getPlatformOverview(ctx));
