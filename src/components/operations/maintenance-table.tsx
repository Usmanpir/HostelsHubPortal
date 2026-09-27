"use client";

import Link from "next/link";
import { Camera, Wrench } from "lucide-react";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { ExportMenu } from "@/components/data-table/export-menu";
import { EnumBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormatters } from "@/components/shared/org-context";
import {
  maintenanceCategoryLabels,
  maintenanceStatusLabels,
  maintenanceStatusTones,
  priorityLabels,
  priorityTones,
} from "@/config/labels";
import type { MaintenanceCategory, MaintenanceStatus, Priority } from "@/generated/prisma/enums";
import type { Paginated } from "@/lib/validation/common";
import { formatRelative } from "@/lib/format";

export type MaintenanceRow = {
  id: string;
  requestNumber: string;
  title: string;
  category: MaintenanceCategory;
  priority: Priority;
  status: MaintenanceStatus;
  createdAt: Date | string;
  completedAt: Date | string | null;
  hostel: { id: string; name: string; code: string };
  room: { id: string; roomNumber: string } | null;
  bed: { id: string; bedNumber: string } | null;
  resident: { id: string; firstName: string; lastName: string; residentCode: string } | null;
  assignedStaff: { id: string; firstName: string; lastName: string } | null;
  _count: { photos: number };
};

export function locationLabel(r: { room: { roomNumber: string } | null; bed: { bedNumber: string } | null }) {
  if (!r.room) return "Common area";
  return r.bed ? `Room ${r.room.roomNumber} · Bed ${r.bed.bedNumber}` : `Room ${r.room.roomNumber}`;
}

export function MaintenanceTable({
  data,
  filters,
  showHostel,
  toolbar,
  emptyAction,
  filtered = false,
}: {
  data: Paginated<MaintenanceRow>;
  filters: FilterDef[];
  showHostel: boolean;
  toolbar?: React.ReactNode;
  emptyAction?: React.ReactNode;
  filtered?: boolean;
}) {
  const fmt = useFormatters();
  const columns: Column<MaintenanceRow>[] = [
    {
      id: "request",
      header: "Request",
      hideable: false,
      sortKey: "requestNumber",
      cell: (r) => (
        <Link href={`/operations/maintenance/${r.id}`} className="flex min-w-0 flex-col hover:text-primary">
          <span className="truncate font-medium">{r.title}</span>
          <span className="font-mono text-xs text-muted-foreground">{r.requestNumber}</span>
        </Link>
      ),
    },
    ...(showHostel ? [{ id: "hostel", header: "Hostel", cell: (r: MaintenanceRow) => r.hostel.name }] : []),
    {
      id: "location",
      header: "Location",
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          {locationLabel(r)}
          {r._count.photos ? (
            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
              <Camera className="size-3" />
              {r._count.photos}
            </span>
          ) : null}
        </span>
      ),
    },
    { id: "category", header: "Category", cell: (r) => maintenanceCategoryLabels[r.category] },
    { id: "priority", header: "Priority", sortKey: "priority", cell: (r) => <EnumBadge value={r.priority} labels={priorityLabels} tones={priorityTones} /> },
    {
      id: "assignee",
      header: "Assigned to",
      cell: (r) => (r.assignedStaff ? `${r.assignedStaff.firstName} ${r.assignedStaff.lastName}` : <span className="text-muted-foreground">Unassigned</span>),
    },
    {
      id: "resident",
      header: "Resident",
      defaultHidden: true,
      cell: (r) => (r.resident ? `${r.resident.firstName} ${r.resident.lastName}` : <span className="text-muted-foreground">—</span>),
    },
    {
      id: "created",
      header: "Reported",
      sortKey: "createdAt",
      cell: (r) => <span title={fmt.dateTime(r.createdAt)}>{formatRelative(r.createdAt)}</span>,
    },
    { id: "status", header: "Status", sortKey: "status", cell: (r) => <EnumBadge value={r.status} labels={maintenanceStatusLabels} tones={maintenanceStatusTones} /> },
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
      rowHref={(r) => `/operations/maintenance/${r.id}`}
      searchPlaceholder="Search number, title, room or resident"
      filters={filters}
      storageKey="maintenance"
      toolbar={
        <>
          {toolbar}
          <ExportMenu endpoint="/api/maintenance/export" />
        </>
      }
      mobileCard={(r) => <MaintenanceMobileCard row={r} showHostel={showHostel} />}
      empty={
        <EmptyState
          icon={Wrench}
          title={filtered ? "No requests match your filters" : "No maintenance requests yet"}
          description="Requests you log — or residents report — show up here with their status."
          action={emptyAction}
        />
      }
    />
  );
}

function MaintenanceMobileCard({ row: r, showHostel }: { row: MaintenanceRow; showHostel: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{r.title}</p>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{r.requestNumber}</span> · {locationLabel(r)}
            {showHostel ? ` · ${r.hostel.name}` : ""}
          </p>
        </div>
        <EnumBadge value={r.status} labels={maintenanceStatusLabels} tones={maintenanceStatusTones} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <EnumBadge value={r.priority} labels={priorityLabels} tones={priorityTones} />
        <span>{maintenanceCategoryLabels[r.category]}</span>
        <span>·</span>
        <span>{r.assignedStaff ? `${r.assignedStaff.firstName} ${r.assignedStaff.lastName}` : "Unassigned"}</span>
        <span className="ms-auto">{formatRelative(r.createdAt)}</span>
      </div>
    </div>
  );
}
