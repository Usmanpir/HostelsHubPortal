"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { ExportMenu } from "@/components/data-table/export-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge } from "@/components/shared/status-badge";
import { useCan, useFormatters } from "@/components/shared/org-context";
import { invoiceStatusLabels, invoiceStatusTones } from "@/config/labels";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import type { Paginated } from "@/lib/validation/common";
import { DateRangeFilter } from "./date-range-filter";

export type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: Date | string;
  dueDate: Date | string;
  periodStart: Date | string | null;
  periodEnd: Date | string | null;
  total: number;
  amountPaid: number;
  balance: number;
  resident: { id: string; name: string; code: string };
  hostel: { id: string; name: string };
};

export function InvoicesTable({
  data,
  filters,
  hasActiveFilters,
  emptyAction,
}: {
  data: Paginated<InvoiceRow>;
  filters: FilterDef[];
  hasActiveFilters: boolean;
  emptyAction?: React.ReactNode;
}) {
  const fmt = useFormatters();
  const can = useCan();
  const canViewResidents = can("residents.view");

  const period = (i: InvoiceRow) =>
    i.periodStart ? (i.periodEnd ? `${fmt.date(i.periodStart)} – ${fmt.date(i.periodEnd)}` : fmt.date(i.periodStart)) : "—";

  const resident = (i: InvoiceRow) =>
    canViewResidents ? (
      <Link href={`/residents/${i.resident.id}`} className="hover:text-primary">
        {i.resident.name}
      </Link>
    ) : (
      i.resident.name
    );

  const columns: Column<InvoiceRow>[] = [
    {
      id: "number",
      header: "Invoice",
      hideable: false,
      sortKey: "number",
      cell: (i) => (
        <Link href={`/finance/invoices/${i.id}`} className="font-mono text-xs font-medium hover:text-primary">
          {i.invoiceNumber}
        </Link>
      ),
    },
    {
      id: "resident",
      header: "Resident",
      cell: (i) => (
        <div className="min-w-0">
          <div className="truncate">{resident(i)}</div>
          <div className="font-mono text-xs text-muted-foreground">{i.resident.code}</div>
        </div>
      ),
    },
    { id: "hostel", header: "Hostel", cell: (i) => i.hostel.name },
    { id: "period", header: "Period", cell: period, className: "whitespace-nowrap text-muted-foreground" },
    { id: "issueDate", header: "Issued", sortKey: "issueDate", cell: (i) => fmt.date(i.issueDate), className: "whitespace-nowrap" },
    { id: "dueDate", header: "Due", sortKey: "dueDate", cell: (i) => fmt.date(i.dueDate), className: "whitespace-nowrap" },
    { id: "total", header: "Total", align: "end", sortKey: "total", cell: (i) => fmt.money(i.total) },
    { id: "paid", header: "Paid", align: "end", cell: (i) => fmt.money(i.amountPaid) },
    {
      id: "balance",
      header: "Balance",
      align: "end",
      cell: (i) => (i.balance > 0 ? <span className="font-medium">{fmt.money(i.balance)}</span> : <span className="text-muted-foreground">—</span>),
    },
    { id: "status", header: "Status", cell: (i) => <EnumBadge value={i.status} labels={invoiceStatusLabels} tones={invoiceStatusTones} /> },
  ];

  return (
    <DataTable
      rows={data.items}
      columns={columns}
      getRowId={(i) => i.id}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      pageSize={data.pageSize}
      rowHref={(i) => `/finance/invoices/${i.id}`}
      searchPlaceholder="Search invoice number or resident"
      filters={filters}
      storageKey="invoices"
      toolbar={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <DateRangeFilter label="Issue date" />
          <ExportMenu endpoint="/api/invoices/export" />
        </div>
      }
      mobileCard={(i) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{i.resident.name}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {i.invoiceNumber} · {i.hostel.name}
              </p>
            </div>
            <EnumBadge value={i.status} labels={invoiceStatusLabels} tones={invoiceStatusTones} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="tabular">{fmt.money(i.total)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className="tabular font-medium">{fmt.money(i.balance)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Due</p>
              <p>{fmt.date(i.dueDate)}</p>
            </div>
          </div>
        </div>
      )}
      empty={
        <EmptyState
          icon={FileText}
          title={hasActiveFilters ? "No invoices match your filters" : "No invoices yet"}
          description={
            hasActiveFilters ? "Try a different status, date range or search." : "Create an invoice or generate this month's rent invoices."
          }
          action={hasActiveFilters ? undefined : emptyAction}
        />
      }
    />
  );
}
