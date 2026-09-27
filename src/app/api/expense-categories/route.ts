import { readJson, tenantRoute } from "@/lib/api/handler";
import { createExpenseCategory, listExpenseCategories } from "@/services/finance/expense-service";
import type { ExpenseCategoryInput } from "@/lib/validation/finance";

/** GET /api/expense-categories — [{ id, key, name, isSystem, expenseCount }] */
export const GET = tenantRoute(async ({ ctx }) => listExpenseCategories(ctx));

/** POST /api/expense-categories — body: { name } */
export const POST = tenantRoute(async ({ req, ctx }) => createExpenseCategory(ctx, (await readJson(req)) as ExpenseCategoryInput));
