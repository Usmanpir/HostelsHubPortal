"use client";

import Link from "next/link";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import type { Paginated } from "@/lib/validation/common";
import { formatDateTime } from "@/lib/format";
import { actionLabel, actionTone } from "./labels";

export type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: Date;
  metadata: string | null;
  isAdmin: boolean;
  organization: { id: string; name: string } | null;
  user: { email: string } | null;
};

function Metadata({ row }: { row: AuditRow }) {
  if (!row.isAdmin) return <span className="text-xs text-muted-foreground">Hidden (tenant data)</span>;
  if (!row.metadata) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <details className="max-w-md text-xs">
      <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">View details</summary>
      <pre className="mt-1 max-h-60 overflow-auto rounded-md bg-muted p-2 font-mono whitespace-pre-wrap break-all">{row.metadata}</pre>
    </details>
  );
}

export function AuditTable({ data, filters }: { data: Paginated<AuditRow>; filters: FilterDef[] }) {
  const columns: Column<AuditRow>[] = [
    {
      id: "action",
      header: "Action",
      hideable: false,
      cell: (r) => (
        <div className="flex flex-col gap-0.5">
          <StatusBadge tone={actionTone(r.action)}>{actionLabel(r.action)}</StatusBadge>
          <span className="font-mono text-[11px] text-muted-foreground">{r.action}</span>
        </div>
      ),
    },
    { id: "entity", header: "Entity", cell: (r) => <span className="text-sm">{r.entityType}</span> },
    {
      id: "org",
      header: "Organization",
      cell: (r) =>
        r.organization ? (
          <Link href={`/admin/organizations/${r.organization.id}`} className="hover:text-primary">
            {r.organization.name}
          </Link>
        ) : (
          <span className="text-muted-foreground">Platform</span>
        ),
    },
    { id: "user", header: "User", cell: (r) => r.user?.email ?? <span className="text-muted-foreground">System</span> },
    { id: "time", header: "Time", cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.createdAt)}</span> },
    { id: "ip", header: "IP", cell: (r) => <span className="font-mono text-xs">{r.ipAddress ?? "—"}</span> },
    { id: "metadata", header: "Details", cell: (r) => <Metadata row={r} /> },
  ];
  return (
    <DataTable
      rows={data.items}
      columns={columns}
      getRowId={(r) => r.id}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      pageSize={data.pageSize}
      searchPlaceholder="Search action, entity, email or organization"
      filters={filters}
      storageKey="admin-audit"
      mobileCard={(r) => (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <StatusBadge tone={actionTone(r.action)}>{actionLabel(r.action)}</StatusBadge>
            <span className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {r.entityType} · {r.organization?.name ?? "Platform"} · {r.user?.email ?? "System"}
            {r.ipAddress ? ` · ${r.ipAddress}` : ""}
          </p>
          {r.isAdmin && r.metadata ? <Metadata row={r} /> : null}
        </div>
      )}
    />
  );
}
