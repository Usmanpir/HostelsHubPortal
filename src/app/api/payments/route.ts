import { readJson, tenantRoute } from "@/lib/api/handler";
import { listPayments, recordPayment } from "@/services/finance/payment-service";
import { parsePaymentFilters } from "@/services/finance/filters";
import type { PaymentInput } from "@/lib/validation/finance";

/** GET /api/payments?q=&method=&type=&status=&from=&to=&hostel=&residentId=&invoiceId=&page=&pageSize= */
export const GET = tenantRoute(async ({ req, ctx }) => listPayments(ctx, parsePaymentFilters(req.nextUrl.searchParams)));

/** POST /api/payments — body: PaymentInput. Returns the created rows (payment + optional advance credit). */
export const POST = tenantRoute(async ({ req, ctx }) => recordPayment(ctx, (await readJson(req)) as PaymentInput));
