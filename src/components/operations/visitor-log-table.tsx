"use client";

import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { ExportMenu } from "@/components/data-table/export-menu";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { useOrg } from "@/components/shared/org-context";
import { useUrlState } from "@/hooks/use-url-state";
import { formatDateTime, formatTime } from "@/lib/format";
import type { Paginated } from "@/lib/validation/common";
import type { VisitorRow } from "./visitors-inside";

function duration(v: VisitorRow) {
  if (!v.checkOutAt) return null;
  const minutes = Math.max(0, Math.round((new Date(v.checkOutAt).getTime() - new Date(v.checkInAt).getTime()) / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function DateRange() {
  const url = useUrlState();
  const [from, setFrom] = useState(url.get("from"));
  const [to, setTo] = useState(url.get("to"));
  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => {
          setFrom(e.target.value);
          url.set({ from: e.target.value || null });
        }}
        className="h-7 w-36 text-xs"
        aria-label="From date"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => {
          setTo(e.target.value);
          url.set({ to: e.target.value || null });
        }}
        className="h-7 w-36 text-xs"
        aria-label="To date"
      />
    </div>
  );
}

export function VisitorLogTable({ data, showHostel, filtered }: { data: Paginated<VisitorRow>; showHostel: boolean; filtered: boolean }) {
  const org = useOrg();
  const dt = (d: Date | string) => formatDateTime(d, org.timezone, org.locale);
  const columns: Column<VisitorRow>[] = [
    {
      id: "visitor",
      header: "Visitor",
      hideable: false,
      cell: (v) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{v.name}</span>
          <span className="text-xs text-muted-foreground">{[v.phone, v.idNumber].filter(Boolean).join(" · ") || "—"}</span>
        </div>
      ),
    },
    { id: "visiting", header: "Visiting", cell: (v) => (v.resident ? `${v.resident.firstName} ${v.resident.lastName}` : <span className="text-muted-foreground">—</span>) },
    ...(showHostel ? [{ id: "hostel", header: "Hostel", cell: (v: VisitorRow) => v.hostel.name }] : []),
    { id: "purpose", header: "Purpose", cell: (v) => v.purpose ?? <span className="text-muted-foreground">—</span> },
    { id: "in", header: "Checked in", cell: (v) => dt(v.checkInAt) },
    {
      id: "out",
      header: "Checked out",
      cell: (v) => (v.checkOutAt ? formatTime(v.checkOutAt, org.timezone, org.locale) : <StatusBadge tone="info">Inside</StatusBadge>),
    },
    { id: "duration", header: "Duration", align: "end", cell: (v) => duration(v) ?? "—" },
    { id: "recordedBy", header: "Recorded by", defaultHidden: true, cell: (v) => v.recordedBy?.name ?? "—" },
    { id: "notes", header: "Notes", defaultHidden: true, cell: (v) => v.notes ?? "—" },
  ];
  return (
    <DataTable
      rows={data.items}
      columns={columns}
      getRowId={(v) => v.id}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      pageSize={data.pageSize}
      searchPlaceholder="Search name, phone, CNIC or resident"
      filters={[
        {
          key: "state",
          label: "Status",
          options: [
            { value: "inside", label: "Inside" },
            { value: "left", label: "Checked out" },
          ],
        },
      ]}
      storageKey="visitors"
      toolbar={
        <>
          <DateRange />
          <ExportMenu endpoint="/api/visitors/export" />
        </>
      }
      mobileCard={(v) => (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{v.name}</p>
              <p className="text-xs text-muted-foreground">
                {v.resident ? `Visiting ${v.resident.firstName} ${v.resident.lastName}` : (v.purpose ?? "Visitor")}
                {showHostel ? ` · ${v.hostel.code}` : ""}
              </p>
            </div>
            {v.checkOutAt ? <StatusBadge tone="neutral">{duration(v)}</StatusBadge> : <StatusBadge tone="info">Inside</StatusBadge>}
          </div>
          <p className="text-xs text-muted-foreground">
            In {dt(v.checkInAt)}
            {v.checkOutAt ? ` · Out ${formatTime(v.checkOutAt, org.timezone, org.locale)}` : ""}
          </p>
        </div>
      )}
      empty={
        <EmptyState
          icon={ClipboardList}
          title={filtered ? "No visits match your filters" : "No visitors logged yet"}
          description="Every check-in is recorded here with times in your organization's time zone."
        />
      }
    />
  );
}
