import { Plus, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { ExpensesTable } from "@/components/finance/expenses-table";
import { ExpenseDialog } from "@/components/finance/expense-dialog";
import { ExpenseCategoriesDialog } from "@/components/finance/expense-categories-dialog";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { formatMoney, todayInTimeZone } from "@/lib/format";
import { getExpenseTotals, listExpenseCategories, listExpenses } from "@/services/finance/expense-service";
import { parseExpenseFilters } from "@/services/finance/filters";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { expenseStatusLabels, optionsFrom } from "@/config/labels";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: PageProps<"/finance/expenses">) {
  const ctx = await requireTenantPage("expenses.view");
  const params = await searchParams;
  const filters = parseExpenseFilters(params);
  const [data, totals, categories, hostels] = await Promise.all([
    listExpenses(ctx, filters),
    getExpenseTotals(ctx, filters),
    listExpenseCategories(ctx),
    listHostelOptions(ctx),
  ]);
  const canManage = can(ctx, "expenses.manage");
  const money = (n: number) => formatMoney(n, ctx.organization.currency, ctx.organization.locale);
  const today = todayInTimeZone(ctx.organization.timezone);
  const hasActiveFilters = !!(filters.q || filters.categoryId || filters.status || filters.from || filters.to || filters.hostelId);
  const hostelOptions = hostels.map((h) => ({ id: h.id, name: h.name }));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));
  const top = totals.byCategory.slice(0, 6);
  const rest = totals.byCategory.slice(6);
  const restTotal = rest.reduce((s, c) => s + c.total, 0);
  const max = Math.max(1, ...top.map((c) => c.total), restTotal);

  const tableFilters = [
    { key: "category", label: "Categories", options: categories.map((c) => ({ value: c.id, label: c.name })) },
    { key: "status", label: "Statuses", options: optionsFrom(expenseStatusLabels) },
    ...(!ctx.activeHostelId && hostels.length > 1
      ? [{ key: "hostel", label: "Hostels", options: hostels.map((h) => ({ value: h.id, label: h.name })) }]
      : []),
  ];

  const recordButton =
    canManage && hostelOptions.length > 0 ? (
      <ExpenseDialog
        hostels={hostelOptions}
        categories={categoryOptions}
        defaultHostelId={ctx.activeHostelId}
        today={today}
        trigger={
          <Button>
            <Plus />
            Record expense
          </Button>
        }
      />
    ) : null;

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Operating costs by hostel and category. Voided expenses are kept but excluded from totals."
        breadcrumbs={[{ label: "Finance", href: can(ctx, "reports.financial") ? "/finance" : undefined }, { label: "Expenses" }]}
        actions={
          <>
            <ExpenseCategoriesDialog
              categories={categories}
              canManage={canManage}
              trigger={
                <Button variant="outline">
                  <Tags />
                  Categories
                </Button>
              }
            />
            {recordButton}
          </>
        }
      />

      <section className="mb-4 grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-[220px_1fr]" aria-label="Totals by category">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Total expenses</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{money(totals.total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totals.count} recorded{filters.from || filters.to ? " in selected dates" : ""}
            {filters.status === "VOIDED" ? " · voided rows are never counted" : ""}
          </p>
        </div>
        {top.length === 0 ? (
          <p className="self-center text-sm text-muted-foreground">No recorded expenses match these filters.</p>
        ) : (
          <ul className="grid gap-2">
            {[...top, ...(rest.length ? [{ categoryId: "__other__", name: `Other (${rest.length})`, total: restTotal, count: rest.reduce((s, c) => s + c.count, 0) }] : [])].map((c) => (
              <li key={c.categoryId} className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate">{c.name}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className="block h-full rounded-full bg-chart-3" style={{ width: `${Math.max(2, (c.total / max) * 100)}%` }} />
                </span>
                <span className="tabular text-end">{money(c.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ExpensesTable
        data={data}
        filters={tableFilters}
        hasActiveFilters={hasActiveFilters}
        hostels={hostelOptions}
        categories={categoryOptions}
        today={today}
        emptyAction={recordButton}
      />
    </>
  );
}
