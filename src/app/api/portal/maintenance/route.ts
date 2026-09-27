import { readJson } from "@/lib/api/handler";
import type { PortalMaintenanceInput } from "@/lib/validation/portal";
import { createPortalMaintenance, listPortalMaintenance } from "@/services/portal/maintenance-service";
import { pageParams, residentRoute } from "../_lib/handler";

/** GET /api/portal/maintenance?page= */
export const GET = residentRoute(async ({ req, ctx }) => listPortalMaintenance(ctx, pageParams(req)));

/**
 * POST /api/portal/maintenance { category, priority, title, description?, photoFileIds? }
 * Photos are uploaded first via POST /api/files (purpose "maintenance-photo").
 */
export const POST = residentRoute(async ({ req, ctx }) =>
  createPortalMaintenance(ctx, (await readJson(req)) as PortalMaintenanceInput),
);
