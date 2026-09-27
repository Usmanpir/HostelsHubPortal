"use client";

import { useState } from "react";
import { Ban, Paperclip, Pencil, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { ExportMenu } from "@/components/data-table/export-menu";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { useCan, useFormatters } from "@/components/shared/org-context";
import { paymentMethodLabels } from "@/config/labels";
import type { ExpenseStatus } from "@/generated/prisma/enums";
import type { Paginated } from "@/lib/validation/common";
import { cn } from "@/lib/utils";
import { voidExpenseAction } from "@/app/(app)/finance/actions";
import { DateRangeFilter } from "./date-range-filter";
import { ExpenseDialog, type ExpenseForEdit } from "./expense-dialog";

export type ExpenseRow = ExpenseForEdit & {
  status: ExpenseStatus;
  voidReason: string | null;
  hostel: { id: string; name: string };
  category: { id: string; name: string };
  createdBy: string | null;
};

export function ExpensesTable({
  data,
  filters,
  hasActiveFilters,
  hostels,
  categories,
  today,
  emptyAction,
}: {
  data: Paginated<ExpenseRow>;
  filters: FilterDef[];
  hasActiveFilters: boolean;
  hostels: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  today: string;
  emptyAction?: React.ReactNode;
}) {
  const fmt = useFormatters();
  const canManage = useCan()("expenses.manage");
  const [editing, setEditing] = useState<ExpenseRow | null>(null);

  const actions = (e: ExpenseRow) => (
    <div className="flex items-center justify-end gap-1">
      {e.receipt ? (
        <Button asChild variant="ghost" size="icon-sm" aria-label="Open receipt">
          <a href={`/api/files/${e.receipt.id}`} target="_blank" rel="noreferrer">
            <Paperclip />
          </a>
        </Button>
      ) : null}
      {canManage && e.status === "RECORDED" ? (
        <>
          <Button variant="ghost" size="icon-sm" aria-label="Edit expense" onClick={() => setEditing(e)}>
            <Pencil />
          </Button>
          <ConfirmAction
            trigger={
              <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label="Void expense">
                <Ban />
              </Button>
            }
            title="Void this expense?"
            description={`${fmt.money(e.amount)} · ${e.category.name} on ${fmt.date(e.date)}. Voided expenses stay on record but are excluded from totals.`}
            confirmLabel="Void expense"
            destructive
            reason={{ label: "Reason", required: true, placeholder: "e.g. Duplicate entry, wrong hostel" }}
            action={voidExpenseAction.bind(null, e.id)}
          />
        </>
      ) : null}
    </div>
  );

  const amount = (e: ExpenseRow) => (
    <span className={cn("tabular", e.status === "VOIDED" && "text-muted-foreground line-through")}>{fmt.money(e.amount)}</span>
  );

  const columns: Column<ExpenseRow>[] = [
    { id: "date", header: "Date", sortKey: "date", hideable: false, cell: (e) => fmt.date(e.date), className: "whitespace-nowrap" },
    { id: "category", header: "Category", cell: (e) => <span className="font-medium">{e.category.name}</span> },
    { id: "hostel", header: "Hostel", cell: (e) => e.hostel.name },
    {
      id: "details",
      header: "Vendor / description",
      cell: (e) => (
        <div className="max-w-72 min-w-0">
          <p className="truncate">{e.vendor || <span className="text-muted-foreground">—</span>}</p>
          {e.description ? <p className="truncate text-xs text-muted-foreground">{e.description}</p> : null}
        </div>
      ),
    },
    { id: "method", header: "Paid by", cell: (e) => paymentMethodLabels[e.paymentMethod] },
    { id: "reference", header: "Reference", cell: (e) => e.reference ?? <span className="text-muted-foreground">—</span>, defaultHidden: true },
    { id: "amount", header: "Amount", align: "end", sortKey: "amount", cell: amount },
    {
      id: "status",
      header: "Status",
      cell: (e) =>
        e.status === "VOIDED" ? (
          <span title={e.voidReason ?? undefined}>
            <StatusBadge tone="neutral">Voided</StatusBadge>
          </span>
        ) : (
          <StatusBadge tone="success">Recorded</StatusBadge>
        ),
    },
    { id: "createdBy", header: "Recorded by", cell: (e) => e.createdBy ?? "—", defaultHidden: true },
    { id: "actions", header: "", hideable: false, hideOnMobile: true, align: "end", cell: actions },
  ];

  return (
    <>
      <DataTable
        rows={data.items}
        columns={columns}
        getRowId={(e) => e.id}
        total={data.total}
        page={data.page}
        pageCount={data.pageCount}
        pageSize={data.pageSize}
        searchPlaceholder="Search vendor, description or reference"
        filters={filters}
        storageKey="expenses"
        toolbar={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <DateRangeFilter label="Expense date" />
            <ExportMenu endpoint="/api/expenses/export" />
          </div>
        }
        mobileCard={(e) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{e.category.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {fmt.date(e.date)} · {e.hostel.name}
                  {e.vendor ? ` · ${e.vendor}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-sm font-medium">
                {amount(e)}
                {e.status === "VOIDED" ? <StatusBadge tone="neutral">Voided</StatusBadge> : null}
              </div>
            </div>
            {e.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{e.description}</p> : null}
            {e.receipt || (canManage && e.status === "RECORDED") ? actions(e) : null}
          </div>
        )}
        empty={
          <EmptyState
            icon={WalletCards}
            title={hasActiveFilters ? "No expenses match your filters" : "No expenses recorded"}
            description={hasActiveFilters ? "Try a different category, hostel or date range." : "Record bills, salaries and purchases to track net income."}
            action={hasActiveFilters ? undefined : emptyAction}
          />
        }
      />
      {editing ? (
        <ExpenseDialog
          key={editing.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          hostels={hostels}
          categories={categories}
          today={today}
          expense={editing}
        />
      ) : null}
    </>
  );
}
