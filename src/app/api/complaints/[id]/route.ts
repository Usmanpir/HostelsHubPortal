import { readJson, tenantRoute } from "@/lib/api/handler";
import { ValidationError } from "@/lib/errors";
import { assignComplaint, getComplaint, updateComplaint, updateComplaintStatus } from "@/services/operations/complaint-service";
import type { ComplaintAssignInput, ComplaintEditInput, ComplaintStatusInput } from "@/lib/validation/operations";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getComplaint(ctx, params.id));

/**
 * PATCH /api/complaints/[id]
 *  - `{ status, resolution? }` → status workflow (RESOLVED requires resolution)
 *  - `{ assignedStaffId }`     → assign ("" or null unassigns)
 *  - otherwise                  → edit details
 */
export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) => {
  const body = await readJson(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("Request body must be a JSON object.");
  const record = body as Record<string, unknown>;
  if ("status" in record) return updateComplaintStatus(ctx, params.id, record as ComplaintStatusInput);
  if ("assignedStaffId" in record && Object.keys(record).length === 1) {
    const assignedStaffId = typeof record.assignedStaffId === "string" ? record.assignedStaffId : "";
    return assignComplaint(ctx, params.id, { assignedStaffId } satisfies ComplaintAssignInput);
  }
  return updateComplaint(ctx, params.id, record as ComplaintEditInput);
});
