import { readJson } from "@/lib/api/handler";
import type { PortalRequestInput } from "@/lib/validation/portal";
import { createPortalRequest, listPortalRequests } from "@/services/portal/request-service";
import { pageParams, residentRoute } from "../_lib/handler";

/** GET /api/portal/requests?page= */
export const GET = residentRoute(async ({ req, ctx }) => listPortalRequests(ctx, pageParams(req)));

/** POST /api/portal/requests { type, subject?, details, preferredRoomType?, startDate?, endDate? } */
export const POST = residentRoute(async ({ req, ctx }) =>
  createPortalRequest(ctx, (await readJson(req)) as PortalRequestInput),
);
