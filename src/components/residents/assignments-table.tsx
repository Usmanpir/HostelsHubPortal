"use client";

import Link from "next/link";
import { CalendarRange, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { EnumBadge } from "@/components/shared/status-badge";
import { useFormatters } from "@/components/shared/org-context";
import { useUrlState } from "@/hooks/use-url-state";
import { assignmentStatusLabels, assignmentStatusTones } from "@/config/labels";
import type { listAssignments } from "@/services/resident/assignment-service";

export type AssignmentsData = Awaited<ReturnType<typeof listAssignments>>;
type Row = AssignmentsData["items"][number];

export function AssignmentsTable({
  data,
  filters,
  showHostel,
  toolbar,
  empty,
}: {
  data: AssignmentsData;
  filters: FilterDef[];
  showHostel: boolean;
  toolbar?: React.ReactNode;
  empty?: React.ReactNode;
}) {
  const fmt = useFormatters();
  const columns: Column<Row>[] = [
    {
      id: "resident",
      header: "Resident",
      hideable: false,
      cell: (a) => (
        <Link href={`/residents/${a.resident.id}`} className="min-w-0 hover:text-primary">
          <span className="block truncate font-medium">
            {a.resident.firstName} {a.resident.lastName}
          </span>
          <span className="block font-mono text-xs text-muted-foreground">{a.resident.residentCode}</span>
        </Link>
      ),
    },
    ...(showHostel ? [{ id: "hostel", header: "Hostel", cell: (a: Row) => a.hostel.name }] : []),
    {
      id: "bed",
      header: "Room / bed",
      cell: (a) => (
        <span className="whitespace-nowrap">
          Room {a.room.roomNumber} · Bed {a.bed.bedNumber}
        </span>
      ),
    },
    { id: "in", header: "Check-in", cell: (a) => <span className="tabular whitespace-nowrap">{fmt.date(a.checkInDate)}</span> },
    {
      id: "out",
      header: "Check-out",
      cell: (a) =>
        a.checkOutDate ? (
          <span className="tabular whitespace-nowrap">{fmt.date(a.checkOutDate)}</span>
        ) : a.status === "ACTIVE" ? (
          <span className="text-success">Present</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { id: "rent", header: "Rent", align: "end", cell: (a) => fmt.money(a.monthlyRent) },
    { id: "deposit", header: "Deposit", align: "end", defaultHidden: true, cell: (a) => fmt.money(a.securityDeposit) },
    {
      id: "settlement",
      header: "Refunded",
      align: "end",
      defaultHidden: true,
      cell: (a) => (a.depositRefund !== null ? fmt.money(a.depositRefund) : <span className="text-muted-foreground">—</span>),
    },
    { id: "status", header: "Status", cell: (a) => <EnumBadge value={a.status} labels={assignmentStatusLabels} tones={assignmentStatusTones} /> },
    {
      id: "reason",
      header: "Note",
      defaultHidden: true,
      cell: (a) => <span className="line-clamp-1 text-muted-foreground">{a.endReason ?? a.notes ?? "—"}</span>,
    },
  ];

  return (
    <DataTable
      rows={data.items}
      columns={columns}
      getRowId={(a) => a.id}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      pageSize={data.pageSize}
      rowHref={(a) => `/residents/${a.resident.id}`}
      searchPlaceholder="Search resident, code or room"
      filters={filters}
      toolbar={
        <>
          <DateRangeFilter />
          {toolbar}
        </>
      }
      storageKey="assignments"
      empty={empty}
      mobileCard={(a) => (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">
                {a.resident.firstName} {a.resident.lastName}
              </p>
              <p className="text-xs text-muted-foreground">
                {showHostel ? `${a.hostel.name} · ` : ""}Room {a.room.roomNumber} · Bed {a.bed.bedNumber}
              </p>
            </div>
            <EnumBadge value={a.status} labels={assignmentStatusLabels} tones={assignmentStatusTones} />
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="tabular">{fmt.date(a.checkInDate)}</span> →{" "}
            <span className="tabular">{a.checkOutDate ? fmt.date(a.checkOutDate) : a.status === "ACTIVE" ? "Present" : "—"}</span> ·{" "}
            <span className="tabular">{fmt.money(a.monthlyRent)}/mo</span>
          </p>
        </div>
      )}
    />
  );
}

/** "Stays during" date range, stored in the URL as from/to. */
function DateRangeFilter() {
  const url = useUrlState();
  const from = url.get("from");
  const to = url.get("to");
  return (
    <div className="flex items-center gap-1.5">
      <CalendarRange className="hidden size-4 text-muted-foreground sm:block" />
      <Input
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => url.set({ from: e.target.value || null })}
        className="h-7 w-[8.5rem] text-xs"
        aria-label="Stays from"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => url.set({ to: e.target.value || null })}
        className="h-7 w-[8.5rem] text-xs"
        aria-label="Stays to"
      />
      {from || to ? (
        <Button size="icon-sm" variant="ghost" onClick={() => url.set({ from: null, to: null })} aria-label="Clear dates">
          <X />
        </Button>
      ) : null}
    </div>
  );
}
