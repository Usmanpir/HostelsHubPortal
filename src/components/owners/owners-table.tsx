"use client";

import Link from "next/link";
import { Handshake, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { useCan, useFormatters, useTerms } from "@/components/shared/org-context";
import { useUrlState } from "@/hooks/use-url-state";
import type { Paginated } from "@/lib/validation/common";
import type { OwnerListItem } from "@/services/owners/owner-service";
import { cn } from "@/lib/utils";

function StatusFilter() {
  const url = useUrlState();
  return (
    <Select value={url.get("status") || "ACTIVE"} onValueChange={(v) => url.set({ status: v === "ACTIVE" ? null : v })}>
      <SelectTrigger size="sm" className="min-w-32" aria-label="Owner status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ACTIVE">Active owners</SelectItem>
        <SelectItem value="ARCHIVED">Archived</SelectItem>
        <SelectItem value="ALL">All owners</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function OwnersTable({
  data,
  hasActiveFilters,
  lastMonthLabel,
}: {
  data: Paginated<OwnerListItem>;
  hasActiveFilters: boolean;
  lastMonthLabel: string;
}) {
  const fmt = useFormatters();
  const terms = useTerms();
  const canManage = useCan()("owners.manage");

  const due = (o: OwnerListItem) => (
    <span className={cn("tabular", o.balanceDue > 0 ? "font-medium text-warning" : o.balanceDue < 0 ? "text-danger" : "text-muted-foreground")}>
      {fmt.money(o.balanceDue)}
    </span>
  );

  const columns: Column<OwnerListItem>[] = [
    {
      id: "name",
      header: "Owner",
      sortKey: "name",
      hideable: false,
      cell: (o) => (
        <div className="min-w-0">
          <Link href={`/owners/${o.id}`} className="flex items-center gap-2 font-medium hover:text-primary">
            <span className="truncate">{o.name}</span>
            {o.archivedAt ? <StatusBadge tone="neutral">Archived</StatusBadge> : null}
          </Link>
          <p className="font-mono text-xs text-muted-foreground">{o.ownerCode}</p>
        </div>
      ),
    },
    {
      id: "phone",
      header: "Phone",
      cell: (o) => (o.phone ? <a href={`tel:${o.phone}`} className="hover:text-primary">{o.phone}</a> : <span className="text-muted-foreground">—</span>),
    },
    {
      id: "properties",
      header: terms.properties,
      align: "end",
      cell: (o) => (
        <span title={o.properties.map((p) => p.name).join(", ") || undefined}>{o.propertyCount}</span>
      ),
    },
    {
      id: "occupancy",
      header: "Occupancy",
      align: "end",
      cell: (o) => (o.occupancy === null ? <span className="text-muted-foreground">—</span> : `${o.occupancy}%`),
    },
    { id: "collected", header: "Collected this month", align: "end", cell: (o) => fmt.money(o.collectedThisMonth) },
    { id: "commission", header: "Commission", align: "end", cell: (o) => `${o.commissionPercent}%` },
    { id: "due", header: `Due for ${lastMonthLabel}`, align: "end", cell: due },
    { id: "email", header: "Email", defaultHidden: true, cell: (o) => o.email ?? "—" },
  ];

  const addButton = canManage ? (
    <Button asChild>
      <Link href="/owners/new">
        <Plus />
        Add owner
      </Link>
    </Button>
  ) : null;

  return (
    <DataTable
      rows={data.items}
      columns={columns}
      getRowId={(o) => o.id}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      pageSize={data.pageSize}
      rowHref={(o) => `/owners/${o.id}`}
      searchPlaceholder="Search name, code, phone or email"
      storageKey="owners"
      toolbar={<StatusFilter />}
      mobileCard={(o) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{o.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{o.ownerCode}</span>
                {o.phone ? ` · ${o.phone}` : ""}
              </p>
            </div>
            {o.archivedAt ? <StatusBadge tone="neutral">Archived</StatusBadge> : <span className="text-sm">{o.commissionPercent}%</span>}
          </div>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{terms.properties}</dt>
              <dd className="tabular">
                {o.propertyCount}
                {o.occupancy !== null ? <span className="text-muted-foreground"> · {o.occupancy}%</span> : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">This month</dt>
              <dd className="tabular truncate">{fmt.money(o.collectedThisMonth)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Due</dt>
              <dd className="truncate">{due(o)}</dd>
            </div>
          </dl>
        </div>
      )}
      empty={
        <EmptyState
          icon={Handshake}
          title={hasActiveFilters ? "No owners match your filters" : "No owners yet"}
          description={
            hasActiveFilters
              ? "Try a different search or status."
              : `Add the landlords whose ${terms.properties.toLowerCase()} you manage, then link their ${terms.properties.toLowerCase()} to generate statements.`
          }
          action={hasActiveFilters ? undefined : addButton}
        />
      }
    />
  );
}
