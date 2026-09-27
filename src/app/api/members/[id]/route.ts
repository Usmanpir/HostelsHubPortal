import { readJson, tenantRoute } from "@/lib/api/handler";
import { removeMember, updateMember } from "@/services/organization/member-service";
import type { MemberUpdateInput } from "@/lib/validation/settings";

type Params = { id: string };

/** PATCH /api/members/[id] — any of `{ roleId, allHostels, hostelIds, status: "ACTIVE" | "SUSPENDED" }`. */
export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) =>
  updateMember(ctx, params.id, (await readJson(req)) as MemberUpdateInput),
);

/** DELETE /api/members/[id] — remove the membership (the user account and history remain). */
export const DELETE = tenantRoute<Params>(async ({ params, ctx }) => {
  await removeMember(ctx, params.id);
  return null;
});
