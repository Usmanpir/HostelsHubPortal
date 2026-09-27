import { listPortalAnnouncements } from "@/services/portal/announcement-service";
import { pageParams, residentRoute } from "../_lib/handler";

/** GET /api/portal/announcements?page= — notices visible to this resident. */
export const GET = residentRoute(async ({ req, ctx }) => listPortalAnnouncements(ctx, pageParams(req)));
