import { readJson, tenantRoute } from "@/lib/api/handler";
import { deleteRole, getRole, updateRole } from "@/services/organization/role-service";
import type { RoleInput } from "@/lib/validation/settings";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getRole(ctx, params.id));

/** PATCH /api/roles/[id] — full role definition including the permission list. */
export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) =>
  updateRole(ctx, params.id, (await readJson(req)) as RoleInput),
);

/** DELETE /api/roles/[id] — custom roles only, when no members or pending invitations use it. */
export const DELETE = tenantRoute<Params>(async ({ params, ctx }) => {
  await deleteRole(ctx, params.id);
  return null;
});
