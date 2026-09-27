import { readJson, tenantRoute } from "@/lib/api/handler";
import { cancelInvoice, getInvoice, updateInvoice } from "@/services/finance/invoice-service";
import type { InvoiceInput } from "@/lib/validation/finance";
import { readReason } from "@/app/api/finance/_lib/read-reason";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getInvoice(ctx, params.id));

/** PATCH /api/invoices/:id — full InvoiceInput; only unpaid draft/pending/overdue invoices. */
export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) =>
  updateInvoice(ctx, params.id, (await readJson(req)) as InvoiceInput),
);

/** DELETE cancels the invoice (never a hard delete). Reason via `?reason=` or JSON body. */
export const DELETE = tenantRoute<Params>(async ({ req, params, ctx }) => cancelInvoice(ctx, params.id, await readReason(req)));
