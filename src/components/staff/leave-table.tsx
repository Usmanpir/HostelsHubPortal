"use client";

import Link from "next/link";
import { Ban, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EnumBadge } from "@/components/shared/status-badge";
import { useCan, useFormatters } from "@/components/shared/org-context";
import { approvalStatusLabels, approvalStatusTones, leaveTypeLabels, staffTypeLabels } from "@/config/labels";
import type { ApprovalStatus, LeaveType, StaffType } from "@/generated/prisma/enums";
import type { Paginated } from "@/lib/validation/common";
import { reviewLeaveAction } from "@/app/(app)/staff/actions";

export type LeaveRow = {
  id: string;
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  days: number;
  reason: string | null;
  status: ApprovalStatus;
  reviewedAt: Date | null;
  reviewedBy: { name: string } | null;
  staff: { id: string; firstName: string; lastName: string; employeeCode: string; designation: StaffType };
};

function ReviewButtons({ row }: { row: LeaveRow }) {
  const can = useCan();
  if (!can("leave.manage")) return null;
  const name = `${row.staff.firstName} ${row.staff.lastName}`;
  if (row.status === "PENDING") {
    return (
      <div className="flex justify-end gap-1.5">
        <ConfirmAction
          trigger={
            <Button size="sm" variant="outline" className="text-success">
              <Check />
              Approve
            </Button>
          }
          title={`Approve leave for ${name}?`}
          description="Approved days will be suggested as Leave on the attendance sheet. Existing attendance marks are not changed."
          confirmLabel="Approve"
          successMessage="Leave approved"
          action={() => reviewLeaveAction(row.id, { decision: "APPROVED" })}
        />
        <ConfirmAction
          trigger={
            <Button size="sm" variant="outline" className="text-destructive">
              <X />
              Reject
            </Button>
          }
          title={`Reject leave for ${name}?`}
          confirmLabel="Reject"
          destructive
          successMessage="Leave rejected"
          action={() => reviewLeaveAction(row.id, { decision: "REJECTED" })}
        />
      </div>
    );
  }
  if (row.status === "APPROVED") {
    return (
      <div className="flex justify-end">
        <ConfirmAction
          trigger={
            <Button size="sm" variant="ghost">
              <Ban />
              Cancel
            </Button>
          }
          title="Cancel this approved leave?"
          description="Attendance already marked stays as it is."
          confirmLabel="Cancel leave"
          destructive
          successMessage="Leave cancelled"
          action={() => reviewLeaveAction(row.id, { decision: "CANCELLED" })}
        />
      </div>
    );
  }
  return null;
}

export function LeaveTable({ data, filters, toolbar, empty }: { data: Paginated<LeaveRow>; filters: FilterDef[]; toolbar?: React.ReactNode; empty?: React.ReactNode }) {
  const fmt = useFormatters();
  const range = (l: LeaveRow) =>
    l.startDate.valueOf() === l.endDate.valueOf() ? fmt.date(l.startDate) : `${fmt.date(l.startDate)} – ${fmt.date(l.endDate)}`;

  const columns: Column<LeaveRow>[] = [
    {
      id: "staff",
      header: "Staff",
      hideable: false,
      cell: (l) => (
        <Link href={`/staff/${l.staff.id}`} className="hover:text-primary">
          <span className="block font-medium">
            {l.staff.firstName} {l.staff.lastName}
          </span>
          <span className="block text-xs text-muted-foreground">
            {staffTypeLabels[l.staff.designation]} · <span className="font-mono">{l.staff.employeeCode}</span>
          </span>
        </Link>
      ),
    },
    { id: "type", header: "Type", cell: (l) => leaveTypeLabels[l.type] },
    { id: "dates", header: "Dates", cell: (l) => <span className="whitespace-nowrap">{range(l)}</span> },
    { id: "days", header: "Days", align: "end", cell: (l) => l.days },
    {
      id: "reason",
      header: "Reason",
      cell: (l) => (l.reason ? <span className="line-clamp-2 max-w-64 text-muted-foreground">{l.reason}</span> : <span className="text-muted-foreground">—</span>),
    },
    { id: "status", header: "Status", cell: (l) => <EnumBadge value={l.status} labels={approvalStatusLabels} tones={approvalStatusTones} /> },
    {
      id: "reviewed",
      header: "Reviewed",
      defaultHidden: true,
      cell: (l) => (l.reviewedBy ? `${l.reviewedBy.name} · ${fmt.date(l.reviewedAt)}` : "—"),
    },
    { id: "actions", header: "", hideable: false, hideOnMobile: true, align: "end", cell: (l) => <ReviewButtons row={l} /> },
  ];

  return (
    <DataTable
      rows={data.items}
      columns={columns}
      getRowId={(l) => l.id}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      pageSize={data.pageSize}
      searchPlaceholder="Search staff name or code"
      filters={filters}
      toolbar={toolbar}
      storageKey="leave"
      empty={empty}
      mobileCard={(l) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={`/staff/${l.staff.id}`} className="block truncate font-medium">
                {l.staff.firstName} {l.staff.lastName}
              </Link>
              <p className="text-xs text-muted-foreground">
                {leaveTypeLabels[l.type]} · {l.days} day{l.days === 1 ? "" : "s"}
              </p>
            </div>
            <EnumBadge value={l.status} labels={approvalStatusLabels} tones={approvalStatusTones} />
          </div>
          <p className="text-sm">{range(l)}</p>
          {l.reason ? <p className="line-clamp-2 text-sm text-muted-foreground">{l.reason}</p> : null}
          <ReviewButtons row={l} />
        </div>
      )}
    />
  );
}
