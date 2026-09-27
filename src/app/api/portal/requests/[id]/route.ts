import { cancelPortalRequest } from "@/services/portal/request-service";
import { residentRoute } from "../../_lib/handler";

/** DELETE /api/portal/requests/:id — withdraw a pending request (status → CANCELLED). */
export const DELETE = residentRoute<{ id: string }>(async ({ params, ctx }) => {
  await cancelPortalRequest(ctx, params.id);
  return null;
});
