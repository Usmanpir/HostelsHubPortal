import { readJson, tenantRoute } from "@/lib/api/handler";
import { inviteMember, listPendingInvitations } from "@/services/organization/member-service";
import type { InviteMemberInput } from "@/lib/validation/settings";

/** GET /api/members/invitations — pending (not accepted, revoked or expired) invitations. */
export const GET = tenantRoute(async ({ ctx }) => listPendingInvitations(ctx));

/** POST /api/members/invitations — `{ email, roleId, allHostels, hostelIds }` → `{ id, inviteUrl }` */
export const POST = tenantRoute(async ({ req, ctx }) => inviteMember(ctx, (await readJson(req)) as InviteMemberInput));
