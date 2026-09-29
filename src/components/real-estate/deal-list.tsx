"use client";

import Link from "next/link";
import { CalendarClock, Handshake } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge, StatusBadge, dotClasses } from "@/components/shared/status-badge";
import { useFormatters, useOrg } from "@/components/shared/org-context";
import { dealStageLabels, dealStageTones, dealTypeLabels, dealTypeTones, formatPriceShort } from "@/config/real-estate-labels";
import type { DealStage, DealType } from "@/generated/prisma/enums";
import { formatRelative } from "@/lib/format";
import type { Paginated } from "@/lib/validation/common";
import { cn } from "@/lib/utils";

export type DealRow = {
  id: string;
  code: string;
  type: DealType;
  stage: DealStage;
  clientName: string;
  agreedAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  commissionPaidAt: Date | string | null;
  expectedCloseDate: Date | string | null;
  closedAt: Date | string | null;
  createdAt: Date | string;
  listing: { id: string; code: string; title: string } | null;
  lead: { id: string; code: string; name: string } | null;
  agent: { id: string; name: string } | null;
};

export function CommissionBadge({ deal }: { deal: Pick<DealRow, "stage" | "commissionAmount" | "commissionPaidAt"> }) {
  if (deal.stage !== "CLOSED_WON" || deal.commissionAmount <= 0) return null;
  return deal.commissionPaidAt ? <StatusBadge tone="success">Commission paid</StatusBadge> : <StatusBadge tone="warning">Commission due</StatusBadge>;
}

export type DealBoardColumn = { stage: DealStage; items: DealRow[]; total: number; value: number };

export function DealBoard({ columns }: { columns: DealBoardColumn[] }) {
  const fmt = useFormatters();
  const { currency, locale } = useOrg();
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-[1000px] grid-cols-4 gap-3">
        {columns.map((col) => (
          <section key={col.stage} className="flex min-h-40 flex-col rounded-xl border bg-muted/30" aria-label={dealStageLabels[col.stage]}>
            <header className="flex flex-col gap-0.5 border-b px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", dotClasses[dealStageTones[col.stage]])} />
                <h2 className="text-sm font-semibold">{dealStageLabels[col.stage]}</h2>
                <span className="ms-auto rounded-full bg-background px-2 text-xs tabular text-muted-foreground">{col.total}</span>
              </div>
              <span className="tabular text-xs text-muted-foreground">{formatPriceShort(col.value, currency, locale)}</span>
            </header>
            <div className="flex flex-col gap-2 p-2">
              {col.items.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">No deals</p>
              ) : (
                col.items.map((d) => (
                  <Link key={d.id} href={`/deals/${d.id}`} className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-xs transition-colors hover:border-primary/30">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{d.clientName}</span>
                        <span className="font-mono text-xs text-muted-foreground">{d.code}</span>
                      </span>
                      <EnumBadge value={d.type} labels={dealTypeLabels} tones={dealTypeTones} />
                    </div>
                    {d.listing ? <p className="truncate text-xs text-muted-foreground">{d.listing.title}</p> : null}
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="tabular font-semibold">{fmt.money(d.agreedAmount)}</span>
                      <span className="tabular text-xs text-muted-foreground">{fmt.money(d.commissionAmount)} comm.</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{d.agent?.name ?? "No agent"}</span>
                      {d.expectedCloseDate && (d.stage === "OPEN" || d.stage === "AGREEMENT") ? (
                        <span className="ms-auto inline-flex items-center gap-1">
                          <CalendarClock className="size-3" />
                          {fmt.date(d.expectedCloseDate)}
                        </span>
                      ) : null}
                      <CommissionBadge deal={d} />
                    </div>
                  </Link>
                ))
              )}
              {col.total > col.items.length ? (
                <Link href={`/deals?view=list&stage=${col.stage}`} className="px-1 py-1 text-center text-xs text-muted-foreground hover:text-primary">
                  View all {col.total}
                </Link>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function DealTable({ data, empty }: { data: Paginated<DealRow>; empty: React.ReactNode }) {
  const fmt = useFormatters();
  const columns: Column<DealRow>[] = [
    {
      id: "deal",
      header: "Deal",
      hideable: false,
      sortKey: "code",
      cell: (d) => (
        <Link href={`/deals/${d.id}`} className="flex min-w-0 flex-col hover:text-primary">
          <span className="truncate font-medium">{d.clientName}</span>
          <span className="font-mono text-xs text-muted-foreground">{d.code}</span>
        </Link>
      ),
    },
    { id: "type", header: "Type", cell: (d) => <EnumBadge value={d.type} labels={dealTypeLabels} tones={dealTypeTones} /> },
    { id: "listing", header: "Listing", cell: (d) => (d.listing ? <span className="line-clamp-1">{d.listing.title}</span> : <span className="text-muted-foreground">—</span>) },
    { id: "amount", header: "Agreed", sortKey: "agreedAmount", align: "end", cell: (d) => fmt.money(d.agreedAmount) },
    {
      id: "commission",
      header: "Commission",
      align: "end",
      cell: (d) => (
        <span className="flex flex-col items-end gap-0.5">
          <span>{fmt.money(d.commissionAmount)}</span>
          <CommissionBadge deal={d} />
        </span>
      ),
    },
    { id: "agent", header: "Agent", cell: (d) => d.agent?.name ?? <span className="text-muted-foreground">—</span> },
    { id: "expected", header: "Expected close", sortKey: "expectedCloseDate", defaultHidden: true, cell: (d) => fmt.date(d.expectedCloseDate) },
    { id: "created", header: "Created", sortKey: "createdAt", cell: (d) => <span title={fmt.dateTime(d.createdAt)}>{formatRelative(d.createdAt)}</span> },
    { id: "stage", header: "Stage", sortKey: "stage", cell: (d) => <EnumBadge value={d.stage} labels={dealStageLabels} tones={dealStageTones} /> },
  ];
  return (
    <DataTable
      rows={data.items}
      columns={columns}
      getRowId={(d) => d.id}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      pageSize={data.pageSize}
      rowHref={(d) => `/deals/${d.id}`}
      hideSearch
      storageKey="deals"
      empty={empty}
      mobileCard={(d) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{d.clientName}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{d.code}</span> · {dealTypeLabels[d.type]}
              </p>
            </div>
            <EnumBadge value={d.stage} labels={dealStageLabels} tones={dealStageTones} />
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="tabular font-semibold">{fmt.money(d.agreedAmount)}</span>
            <CommissionBadge deal={d} />
          </div>
        </div>
      )}
    />
  );
}

export function DealEmpty({ filtered, action }: { filtered: boolean; action?: React.ReactNode }) {
  return (
    <EmptyState
      icon={Handshake}
      title={filtered ? "No deals match your filters" : "No deals yet"}
      description="Start a deal from a lead or a listing once a client agrees on a price."
      action={action}
    />
  );
}
