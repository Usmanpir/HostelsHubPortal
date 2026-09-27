"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Eye, MoreHorizontal, Pencil, Phone, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { useCan, useFormatters } from "@/components/shared/org-context";
import { staffStatusLabels, staffStatusTones, staffTypeLabels } from "@/config/labels";
import type { EmploymentType, StaffStatus, StaffType } from "@/generated/prisma/enums";
import type { Paginated } from "@/lib/validation/common";
import { restoreStaffAction } from "@/app/(app)/staff/actions";
import { ArchiveStaffDialog } from "./archive-staff-dialog";
import { StaffAvatar } from "./staff-avatar";

export type StaffRow = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  designation: StaffType;
  employmentType: EmploymentType;
  status: StaffStatus;
  salary: number | null;
  photoFileId: string | null;
  archivedAt: Date | null;
  hostels: { isPrimary: boolean; hostel: { id: string; name: string; code: string } }[];
};

const nameOf = (s: StaffRow) => `${s.firstName} ${s.lastName}`;

function StaffStatusBadge({ row }: { row: StaffRow }) {
  return row.archivedAt ? (
    <StatusBadge tone="neutral">Archived</StatusBadge>
  ) : (
    <EnumBadge value={row.status} labels={staffStatusLabels} tones={staffStatusTones} />
  );
}

function HostelList({ row }: { row: StaffRow }) {
  if (row.hostels.length === 0) return <span className="text-muted-foreground">—</span>;
  const [first, ...rest] = row.hostels;
  return (
    <span className="inline-flex max-w-56 items-center gap-1.5">
      <span className="truncate">{first!.hostel.name}</span>
      {rest.length ? (
        <span className="shrink-0 rounded-md bg-muted px-1.5 text-xs text-muted-foreground" title={rest.map((h) => h.hostel.name).join(", ")}>
          +{rest.length}
        </span>
      ) : null}
    </span>
  );
}

function RowActions({ row }: { row: StaffRow }) {
  const can = useCan();
  const router = useRouter();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const manage = can("staff.manage");

  const restore = () =>
    startTransition(async () => {
      const result = await restoreStaffAction(row.id);
      if (result.ok) {
        toast.success(result.message ?? "Restored");
        router.refresh();
      } else toast.error(result.error);
    });

  // Stop clicks (including ones inside portalled dialogs) from reaching the clickable table row.
  return (
    <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${nameOf(row)}`} disabled={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/staff/${row.id}`}>
              <Eye />
              View profile
            </Link>
          </DropdownMenuItem>
          {manage && !row.archivedAt ? (
            <DropdownMenuItem asChild>
              <Link href={`/staff/${row.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <a href={`tel:${row.phone}`}>
              <Phone />
              Call
            </a>
          </DropdownMenuItem>
          {manage ? (
            <>
              <DropdownMenuSeparator />
              {row.archivedAt ? (
                <DropdownMenuItem onSelect={restore}>
                  <ArchiveRestore />
                  Restore
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant="destructive" onSelect={() => setArchiveOpen(true)}>
                  <Archive />
                  Archive
                </DropdownMenuItem>
              )}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ArchiveStaffDialog staff={{ id: row.id, name: nameOf(row) }} open={archiveOpen} onOpenChange={setArchiveOpen} />
    </span>
  );
}

export function StaffTable({
  data,
  filters,
  showSalary,
  toolbar,
  empty,
}: {
  data: Paginated<StaffRow>;
  filters: FilterDef[];
  showSalary: boolean;
  toolbar?: React.ReactNode;
  empty?: React.ReactNode;
}) {
  const fmt = useFormatters();
  const columns: Column<StaffRow>[] = [
    {
      id: "name",
      header: "Name",
      sortKey: "name",
      hideable: false,
      cell: (s) => (
        <Link href={`/staff/${s.id}`} className="flex items-center gap-2.5 hover:text-primary">
          <StaffAvatar name={nameOf(s)} photoFileId={s.photoFileId} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{nameOf(s)}</span>
            <span className="block font-mono text-xs text-muted-foreground">{s.employeeCode}</span>
          </span>
        </Link>
      ),
    },
    { id: "designation", header: "Designation", sortKey: "designation", cell: (s) => staffTypeLabels[s.designation] },
    { id: "hostels", header: "Hostel(s)", cell: (s) => <HostelList row={s} /> },
    {
      id: "phone",
      header: "Phone",
      cell: (s) => (
        <a href={`tel:${s.phone}`} className="tabular hover:text-primary">
          {s.phone}
        </a>
      ),
    },
    ...(showSalary
      ? [
          {
            id: "salary",
            header: "Salary",
            sortKey: "salary",
            align: "end",
            cell: (s: StaffRow) => (s.salary !== null ? fmt.money(s.salary) : "—"),
          } satisfies Column<StaffRow>,
        ]
      : []),
    { id: "status", header: "Status", sortKey: "status", cell: (s) => <StaffStatusBadge row={s} /> },
    { id: "actions", header: "", hideable: false, hideOnMobile: true, align: "end", cell: (s) => <RowActions row={s} /> },
  ];

  return (
    <DataTable
      rows={data.items}
      columns={columns}
      getRowId={(s) => s.id}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      pageSize={data.pageSize}
      rowHref={(s) => `/staff/${s.id}`}
      searchPlaceholder="Search name, code, phone or email"
      filters={filters}
      toolbar={toolbar}
      storageKey="staff"
      empty={empty}
      mobileCard={(s) => (
        <div className="flex items-start gap-3">
          <StaffAvatar name={nameOf(s)} photoFileId={s.photoFileId} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{nameOf(s)}</p>
                <p className="text-xs text-muted-foreground">
                  {staffTypeLabels[s.designation]} · <span className="font-mono">{s.employeeCode}</span>
                </p>
              </div>
              <StaffStatusBadge row={s} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="tabular">{s.phone}</span>
              {s.hostels.find((h) => h.isPrimary) ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3" />
                  {s.hostels.find((h) => h.isPrimary)!.hostel.name}
                  {s.hostels.length > 1 ? ` +${s.hostels.length - 1}` : ""}
                </span>
              ) : null}
              {showSalary && s.salary !== null ? <span className="tabular text-foreground">{fmt.money(s.salary)}</span> : null}
            </div>
          </div>
        </div>
      )}
    />
  );
}
