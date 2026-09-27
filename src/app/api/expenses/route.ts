import { readJson, tenantRoute } from "@/lib/api/handler";
import { createExpense, listExpenses } from "@/services/finance/expense-service";
import { parseExpenseFilters } from "@/services/finance/filters";
import type { ExpenseInput } from "@/lib/validation/finance";

/** GET /api/expenses?q=&category=&hostel=&status=&from=&to=&sort=&dir=&page=&pageSize= */
export const GET = tenantRoute(async ({ req, ctx }) => listExpenses(ctx, parseExpenseFilters(req.nextUrl.searchParams)));

/** POST /api/expenses — body: ExpenseInput */
export const POST = tenantRoute(async ({ req, ctx }) => createExpense(ctx, (await readJson(req)) as ExpenseInput));
