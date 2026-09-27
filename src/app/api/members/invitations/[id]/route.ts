import { tenantRoute } from "@/lib/api/handler";
import { cancelInvitation } from "@/services/organization/member-service";

type Params = { id: string };

/** DELETE /api/members/invitations/[id] — revoke a pending invitation. */
export const DELETE = tenantRoute<Params>(async ({ params, ctx }) => {
  await cancelInvitation(ctx, params.id);
  return null;
});
