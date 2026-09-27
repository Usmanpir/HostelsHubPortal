"use client";

import Link from "next/link";
import { MessageSquareWarning } from "lucide-react";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { ExportMenu } from "@/components/data-table/export-menu";
import { EnumBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormatters } from "@/components/shared/org-context";
import { complaintCategoryLabels, complaintStatusLabels, complaintStatusTones, priorityLabels, priorityTones } from "@/config/labels";
import type { ComplaintCategory, ComplaintStatus, Priority } from "@/generated/prisma/enums";
import type { Paginated } from "@/lib/validation/common";
import { formatRelative } from "@/lib/format";

export type ComplaintRow = {
  id: string;
  complaintNumber: string;
  title: string;
  category: ComplaintCategory;
  priority: Priority;
  status: ComplaintStatus;
  createdAt: Date | string;
  resolvedAt: Date | string | null;
  hostel: { id: string; name: string; code: string };
  resident: { id: string; firstName: string; lastName: string; residentCode: string } | null;
  assignedStaff: { id: string; firstName: string; lastName: string } | null;
};

export function ComplaintsTable({
  data,
  filters,
  showHostel,
  emptyAction,
  filtered = false,
}: {
  data: Paginated<ComplaintRow>;
  filters: FilterDef[];
  showHostel: boolean;
  emptyAction?: React.ReactNode;
  filtered?: boolean;
}) {
  const fmt = useFormatters();
  const columns: Column<ComplaintRow>[] = [
    {
      id: "complaint",
      header: "Complaint",
      hideable: false,
      sortKey: "complaintNumber",
      cell: (r) => (
        <Link href={`/operations/complaints/${r.id}`} className="flex min-w-0 flex-col hover:text-primary">
          <span className="truncate font-medium">{r.title}</span>
          <span className="font-mono text-xs text-muted-foreground">{r.complaintNumber}</span>
        </Link>
      ),
    },
    {
      id: "resident",
      header: "Resident",
      cell: (r) => (r.resident ? `${r.resident.firstName} ${r.resident.lastName}` : <span className="text-muted-foreground">Anonymous / staff</span>),
    },
    ...(showHostel ? [{ id: "hostel", header: "Hostel", cell: (r: ComplaintRow) => r.hostel.name }] : []),
    { id: "category", header: "Category", cell: (r) => complaintCategoryLabels[r.category] },
    { id: "priority", header: "Priority", sortKey: "priority", cell: (r) => <EnumBadge value={r.priority} labels={priorityLabels} tones={priorityTones} /> },
    {
      id: "assignee",
      header: "Assigned to",
      cell: (r) => (r.assignedStaff ? `${r.assignedStaff.firstName} ${r.assignedStaff.lastName}` : <span className="text-muted-foreground">Unassigned</span>),
    },
    { id: "created", header: "Submitted", sortKey: "createdAt", cell: (r) => <span title={fmt.dateTime(r.createdAt)}>{formatRelative(r.createdAt)}</span> },
    { id: "status", header: "Status", sortKey: "status", cell: (r) => <EnumBadge value={r.status} labels={complaintStatusLabels} tones={complaintStatusTones} /> },
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
      rowHref={(r) => `/operations/complaints/${r.id}`}
      searchPlaceholder="Search number, subject or resident"
      filters={filters}
      storageKey="complaints"
      toolbar={<ExportMenu endpoint="/api/complaints/export" />}
      mobileCard={(r) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.title}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{r.complaintNumber}</span>
                {r.resident ? ` · ${r.resident.firstName} ${r.resident.lastName}` : ""}
                {showHostel ? ` · ${r.hostel.name}` : ""}
              </p>
            </div>
            <EnumBadge value={r.status} labels={complaintStatusLabels} tones={complaintStatusTones} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <EnumBadge value={r.priority} labels={priorityLabels} tones={priorityTones} />
            <span>{complaintCategoryLabels[r.category]}</span>
            <span>·</span>
            <span>{r.assignedStaff ? `${r.assignedStaff.firstName} ${r.assignedStaff.lastName}` : "Unassigned"}</span>
            <span className="ms-auto">{formatRelative(r.createdAt)}</span>
          </div>
        </div>
      )}
      empty={
        <EmptyState
          icon={MessageSquareWarning}
          title={filtered ? "No complaints match your filters" : "No complaints yet"}
          description="Complaints logged by staff or submitted by residents appear here."
          action={emptyAction}
        />
      }
    />
  );
}
