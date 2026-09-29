"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { ExportMenu } from "@/components/data-table/export-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { useCan, useFormatters } from "@/components/shared/org-context";
import { paymentMethodLabels, paymentStatusLabels, paymentStatusTones, paymentTypeLabels, type Tone } from "@/config/labels";
import type { PaymentMethod, PaymentProvider, PaymentStatus, PaymentType } from "@/generated/prisma/enums";
import { paymentProviderLabels } from "@/config/payment-labels";
import type { Paginated } from "@/lib/validation/common";
import { cn } from "@/lib/utils";
import { DateRangeFilter } from "./date-range-filter";

export type PaymentRow = {
  id: string;
  receiptNumber: string;
  paymentDate: Date | string;
  type: PaymentType;
  status: PaymentStatus;
  method: PaymentMethod;
  amount: number;
  reference: string | null;
  resident: { id: string; name: string; code: string };
  hostel: { id: string; name: string };
  invoice: { id: string; invoiceNumber: string } | null;
  receivedBy: string | null;
  /** Set when the payment came from an online checkout (JazzCash / Easypaisa). */
  onlineProvider?: PaymentProvider | null;
};

function methodLabel(p: PaymentRow) {
  return p.onlineProvider ? `Online (${paymentProviderLabels[p.onlineProvider]})` : paymentMethodLabels[p.method];
}

const typeTones: Record<PaymentType, Tone> = { PAYMENT: "info", ADVANCE: "accent", REFUND: "warning" };

/** Signed display: refunds and applied credit are money out of the resident's balance. */
function signed(p: PaymentRow) {
  return p.type === "REFUND" ? -p.amount : p.amount;
}

export function PaymentsTable({
  data,
  filters,
  hasActiveFilters,
  emptyAction,
}: {
  data: Paginated<PaymentRow>;
  filters: FilterDef[];
  hasActiveFilters: boolean;
  emptyAction?: React.ReactNode;
}) {
  const fmt = useFormatters();
  const can = useCan();
  const canViewInvoices = can("invoices.view");
  const canViewResidents = can("residents.view");

  const amount = (p: PaymentRow) => (
    <span className={cn("tabular", p.status === "VOIDED" && "text-muted-foreground line-through", signed(p) < 0 && p.status !== "VOIDED" && "text-danger")}>
      {signed(p) < 0 ? "− " : ""}
      {fmt.money(Math.abs(p.amount))}
    </span>
  );

  const columns: Column<PaymentRow>[] = [
    {
      id: "receipt",
      header: "Receipt",
      hideable: false,
      sortKey: "receipt",
      cell: (p) => (
        <Link href={`/finance/payments/${p.id}`} className="font-mono text-xs font-medium hover:text-primary">
          {p.receiptNumber}
        </Link>
      ),
    },
    { id: "date", header: "Date", sortKey: "date", cell: (p) => fmt.date(p.paymentDate), className: "whitespace-nowrap" },
    {
      id: "resident",
      header: "Resident",
      cell: (p) => (
        <div className="min-w-0">
          <div className="truncate">
            {canViewResidents ? (
              <Link href={`/residents/${p.resident.id}`} className="hover:text-primary">
                {p.resident.name}
              </Link>
            ) : (
              p.resident.name
            )}
          </div>
          <div className="text-xs text-muted-foreground">{p.hostel.name}</div>
        </div>
      ),
    },
    {
      id: "invoice",
      header: "Invoice",
      cell: (p) =>
        p.invoice ? (
          canViewInvoices ? (
            <Link href={`/finance/invoices/${p.invoice.id}`} className="font-mono text-xs hover:text-primary">
              {p.invoice.invoiceNumber}
            </Link>
          ) : (
            <span className="font-mono text-xs">{p.invoice.invoiceNumber}</span>
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "type",
      header: "Type",
      cell: (p) => <StatusBadge tone={typeTones[p.type]} dot={false}>{p.type === "ADVANCE" && p.amount < 0 ? "Credit applied" : paymentTypeLabels[p.type]}</StatusBadge>,
    },
    { id: "method", header: "Method", cell: (p) => methodLabel(p) },
    { id: "amount", header: "Amount", align: "end", sortKey: "amount", cell: amount },
    { id: "status", header: "Status", cell: (p) => <EnumBadge value={p.status} labels={paymentStatusLabels} tones={paymentStatusTones} /> },
    { id: "receivedBy", header: "Received by", cell: (p) => p.receivedBy ?? <span className="text-muted-foreground">{p.onlineProvider ? "Online" : "—"}</span> },
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
      rowHref={(p) => `/finance/payments/${p.id}`}
      searchPlaceholder="Search receipt, invoice, reference or resident"
      filters={filters}
      storageKey="payments"
      toolbar={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <DateRangeFilter label="Payment date" />
          <ExportMenu endpoint="/api/payments/export" />
        </div>
      }
      mobileCard={(p) => (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{p.resident.name}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {p.receiptNumber}
              {p.invoice ? ` · ${p.invoice.invoiceNumber}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {fmt.date(p.paymentDate)} · {methodLabel(p)} · {paymentTypeLabels[p.type]}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-sm font-medium">
            {amount(p)}
            {p.status === "VOIDED" ? <EnumBadge value={p.status} labels={paymentStatusLabels} tones={paymentStatusTones} /> : null}
          </div>
        </div>
      )}
      empty={
        <EmptyState
          icon={Receipt}
          title={hasActiveFilters ? "No payments match your filters" : "No payments yet"}
          description={hasActiveFilters ? "Try a different method, type or date range." : "Payments you record will appear here with printable receipts."}
          action={hasActiveFilters ? undefined : emptyAction}
        />
      }
    />
  );
}
