import { getPortalPayment } from "@/services/portal/billing-service";
import { residentRoute } from "../../_lib/handler";

/** GET /api/portal/payments/:id — receipt details. */
export const GET = residentRoute<{ id: string }>(async ({ params, ctx }) => getPortalPayment(ctx, params.id));
