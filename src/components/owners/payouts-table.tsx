"use client";

import Link from "next/link";
import { Banknote } from "lucide-react";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { ExportMenu } from "@/components/data-table/export-menu";
import { DateRangeFilter } from "@/components/finance/date-range-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge } from "@/components/shared/status-badge";
import { useFormatters } from "@/components/shared/org-context";
import { paymentMethodLabels } from "@/config/labels";
import { ownerPayoutStatusLabels, ownerPayoutStatusTones } from "@/config/owner-labels";
import type { Paginated } from "@/lib/validation/common";
import type { PayoutItem } from "@/services/owners/payout-service";
import { periodLabel } from "@/services/owners/period";
import { cn } from "@/lib/utils";
import { PayoutActions } from "./payout-actions";

export function PayoutsTable({
  data,
  filters,
  hasActiveFilters,
  today,
}: {
  data: Paginated<PayoutItem>;
  filters: FilterDef[];
  hasActiveFilters: boolean;
  today: string;
}) {
  const fmt = useFormatters();
  const period = (p: PayoutItem) => periodLabel({ from: p.periodStart, to: p.periodEnd });
  const net = (p: PayoutItem) => (
    <span className={cn("tabular font-medium", p.status === "CANCELLED" && "text-muted-foreground line-through", p.netPayable < 0 && p.status !== "CANCELLED" && "text-danger")}>
      {fmt.money(p.netPayable)}
    </span>
  );

  const columns: Column<PayoutItem>[] = [
    { id: "period", header: "Period", sortKey: "periodStart", hideable: false, cell: (p) => <span className="whitespace-nowrap">{period(p)}</span> },
    {
      id: "owner",
      header: "Owner",
      cell: (p) => (
        <Link href={`/owners/${p.owner.id}`} className="hover:text-primary">
          <span className="font-medium">{p.owner.name}</span>
          <span className="block font-mono text-xs text-muted-foreground">{p.owner.ownerCode}</span>
        </Link>
      ),
    },
    { id: "collected", header: "Collected", align: "end", cell: (p) => fmt.money(p.rentCollected) },
    { id: "expenses", header: "Expenses", align: "end", cell: (p) => fmt.money(p.expenses) },
    { id: "fee", header: "Fee", align: "end", cell: (p) => fmt.money(p.commission) },
    {
      id: "adjustments",
      header: "Adjustments",
      align: "end",
      defaultHidden: true,
      cell: (p) => (p.adjustments === 0 ? <span className="text-muted-foreground">—</span> : fmt.money(p.adjustments)),
    },
    { id: "net", header: "Net payable", align: "end", sortKey: "netPayable", cell: net },
    { id: "status", header: "Status", cell: (p) => <EnumBadge value={p.status} labels={ownerPayoutStatusLabels} tones={ownerPayoutStatusTones} /> },
    {
      id: "paid",
      header: "Paid",
      sortKey: "paidAt",
      cell: (p) =>
        p.paidAt ? (
          <div className="whitespace-nowrap">
            {fmt.date(p.paidAt)}
            <span className="block text-xs text-muted-foreground">
              {p.paymentMethod ? paymentMethodLabels[p.paymentMethod] : ""}
              {p.reference ? ` · ${p.reference}` : ""}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { id: "notes", header: "Notes", defaultHidden: true, cell: (p) => <span className="line-clamp-2 max-w-60 text-xs">{p.notes ?? "—"}</span> },
    { id: "createdBy", header: "Created by", defaultHidden: true, cell: (p) => p.createdBy ?? "—" },
    { id: "actions", header: "", hideable: false, hideOnMobile: true, align: "end", cell: (p) => <PayoutActions payout={p} today={today} size="icon-sm" /> },
  ];

  return (
    <DataTable
      rows={data.items}
      columns={columns}
      getRowId={(p) => p.id}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      pageSize={data.pageSize}
      searchPlaceholder="Search owner or reference"
      filters={filters}
      storageKey="owner-payouts"
      toolbar={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <DateRangeFilter label="Period" />
          <ExportMenu endpoint="/api/owners/payouts/export" />
        </div>
      }
      mobileCard={(p) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{p.owner.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {period(p)}
                {p.paidAt ? ` · paid ${fmt.date(p.paidAt)}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
              {net(p)}
              <EnumBadge value={p.status} labels={ownerPayoutStatusLabels} tones={ownerPayoutStatusTones} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Collected {fmt.money(p.rentCollected)} · expenses {fmt.money(p.expenses)} · fee {fmt.money(p.commission)}
          </p>
          <PayoutActions payout={p} today={today} />
        </div>
      )}
      empty={
        <EmptyState
          icon={Banknote}
          title={hasActiveFilters ? "No payouts match your filters" : "No payouts yet"}
          description={
            hasActiveFilters
              ? "Try a different owner, status or period."
              : "Open an owner's statement and choose “Create payout” to record what you owe them for a period."
          }
        />
      }
    />
  );
}
