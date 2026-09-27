import { readJson } from "@/lib/api/handler";
import type { PortalComplaintInput } from "@/lib/validation/portal";
import { createPortalComplaint, listPortalComplaints } from "@/services/portal/complaint-service";
import { pageParams, residentRoute } from "../_lib/handler";

/** GET /api/portal/complaints?page= */
export const GET = residentRoute(async ({ req, ctx }) => listPortalComplaints(ctx, pageParams(req)));

/** POST /api/portal/complaints { category, priority, title, description } */
export const POST = residentRoute(async ({ req, ctx }) =>
  createPortalComplaint(ctx, (await readJson(req)) as PortalComplaintInput),
);
