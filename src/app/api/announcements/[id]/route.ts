import { readJson, tenantRoute } from "@/lib/api/handler";
import { archiveAnnouncement, getAnnouncement, updateAnnouncement } from "@/services/operations/announcement-service";
import type { AnnouncementInput } from "@/lib/validation/operations";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getAnnouncement(ctx, params.id));

export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) =>
  updateAnnouncement(ctx, params.id, (await readJson(req)) as AnnouncementInput),
);

/** DELETE archives the announcement (kept for history). */
export const DELETE = tenantRoute<Params>(async ({ params, ctx }) => {
  await archiveAnnouncement(ctx, params.id);
  return null;
});
