import { readJson, tenantRoute } from "@/lib/api/handler";
import { createRole, duplicateRole, listRoles } from "@/services/organization/role-service";
import type { RoleInput } from "@/lib/validation/settings";

/** GET /api/roles — organization roles with member counts. */
export const GET = tenantRoute(async ({ ctx }) => listRoles(ctx));

/**
 * POST /api/roles — create a custom role `{ name, description, defaultAllHostels, permissions }`,
 * or duplicate one with `{ duplicateFromId, name }`.
 */
export const POST = tenantRoute(async ({ req, ctx }) => {
  const body = (await readJson(req)) as (RoleInput & { duplicateFromId?: unknown }) | null;
  if (body && typeof body.duplicateFromId === "string") {
    return duplicateRole(ctx, body.duplicateFromId, { name: body.name });
  }
  return createRole(ctx, body as RoleInput);
});
