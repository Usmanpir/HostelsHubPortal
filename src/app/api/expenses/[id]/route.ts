import { readJson, tenantRoute } from "@/lib/api/handler";
import { getExpense, updateExpense, voidExpense } from "@/services/finance/expense-service";
import type { ExpenseInput } from "@/lib/validation/finance";
import { readReason } from "@/app/api/finance/_lib/read-reason";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getExpense(ctx, params.id));

export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) =>
  updateExpense(ctx, params.id, (await readJson(req)) as ExpenseInput),
);

/** DELETE voids the expense (reason via `?reason=` or JSON body). Expenses are never deleted. */
export const DELETE = tenantRoute<Params>(async ({ req, params, ctx }) => voidExpense(ctx, params.id, await readReason(req)));
