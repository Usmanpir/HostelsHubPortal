import { tenantRoute } from "@/lib/api/handler";
import { getPayment, voidPayment } from "@/services/finance/payment-service";
import { readReason } from "@/app/api/finance/_lib/read-reason";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getPayment(ctx, params.id));

/** DELETE voids the payment (reason via `?reason=` or JSON body). Payments are never deleted. */
export const DELETE = tenantRoute<Params>(async ({ req, params, ctx }) => voidPayment(ctx, params.id, await readReason(req)));
