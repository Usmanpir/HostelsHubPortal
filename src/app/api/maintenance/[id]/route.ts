import { readJson, tenantRoute } from "@/lib/api/handler";
import { ValidationError } from "@/lib/errors";
import {
  assignMaintenance,
  getMaintenance,
  updateMaintenance,
  updateMaintenanceStatus,
} from "@/services/operations/maintenance-service";
import type { MaintenanceAssignInput, MaintenanceEditInput, MaintenanceStatusInput } from "@/lib/validation/operations";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getMaintenance(ctx, params.id));

/**
 * PATCH /api/maintenance/[id]
 *  - `{ status, notes?, releaseBed? }` → status / resolution notes
 *  - `{ assignedStaffId }`             → assign ("" or null unassigns)
 *  - otherwise                          → edit details (category, priority, title, …)
 */
export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) => {
  const body = await readJson(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("Request body must be a JSON object.");
  const record = body as Record<string, unknown>;
  if ("status" in record) return updateMaintenanceStatus(ctx, params.id, record as MaintenanceStatusInput);
  if ("assignedStaffId" in record && Object.keys(record).length === 1) {
    const assignedStaffId = typeof record.assignedStaffId === "string" ? record.assignedStaffId : "";
    return assignMaintenance(ctx, params.id, { assignedStaffId } satisfies MaintenanceAssignInput);
  }
  return updateMaintenance(ctx, params.id, record as MaintenanceEditInput);
});
