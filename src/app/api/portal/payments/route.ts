import { listPortalPayments } from "@/services/portal/billing-service";
import { pageParams, residentRoute } from "../_lib/handler";

/** GET /api/portal/payments?page= — completed and voided receipts. */
export const GET = residentRoute(async ({ req, ctx }) => listPortalPayments(ctx, pageParams(req)));
