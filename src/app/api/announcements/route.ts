import { readJson, searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { createAnnouncement, listAnnouncements } from "@/services/operations/announcement-service";
import type { AnnouncementFilters, AnnouncementInput } from "@/lib/validation/operations";

/** GET /api/announcements?q=&category=&audience=&state=active|scheduled|expired|archived&page=&pageSize= */
export const GET = tenantRoute(async ({ req, ctx }) => listAnnouncements(ctx, searchParamsObject(req) as AnnouncementFilters));

/** POST /api/announcements — publishes now (or on `publishDate`) and notifies the audience. */
export const POST = tenantRoute(async ({ req, ctx }) => createAnnouncement(ctx, (await readJson(req)) as AnnouncementInput));
