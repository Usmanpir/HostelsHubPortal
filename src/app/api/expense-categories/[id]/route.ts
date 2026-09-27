import { tenantRoute } from "@/lib/api/handler";
import { deleteExpenseCategory } from "@/services/finance/expense-service";

/** DELETE removes an unused custom category; built-in and in-use categories are kept. */
export const DELETE = tenantRoute<{ id: string }>(async ({ params, ctx }) => {
  await deleteExpenseCategory(ctx, params.id);
  return null;
});
