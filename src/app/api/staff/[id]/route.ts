import { readJson, tenantRoute } from "@/lib/api/handler";
import { archiveStaff, getStaff, restoreStaff, updateStaff } from "@/services/staff/staff-service";
import { ValidationError } from "@/lib/errors";
import type { ArchiveStaffInput, StaffInput } from "@/lib/validation/staff";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getStaff(ctx, params.id));

/** PATCH updates the record; `{ "action": "restore" }` restores an archived one. */
export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) => {
  const body = await readJson(req);
  if (body && typeof body === "object" && (body as { action?: unknown }).action === "restore") {
    await restoreStaff(ctx, params.id);
    return getStaff(ctx, params.id);
  }
  return updateStaff(ctx, params.id, body as StaffInput);
});

/** DELETE archives (soft delete). Optional body `{ "status": "RESIGNED" | "TERMINATED" }`. */
export const DELETE = tenantRoute<Params>(async ({ req, params, ctx }) => {
  const text = await req.text();
  let body: ArchiveStaffInput = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text) as ArchiveStaffInput;
    } catch {
      throw new ValidationError("Request body must be valid JSON.");
    }
  }
  await archiveStaff(ctx, params.id, body);
  return null;
});
