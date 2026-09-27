"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowRightLeft, BellRing, Eye, LogIn, LogOut, MoreHorizontal, Pencil, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable, type BulkAction, type Column, type FilterDef } from "@/components/data-table/data-table";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { useCan, useFormatters } from "@/components/shared/org-context";
import { assignmentStatusLabels, residentStatusLabels, residentStatusTones } from "@/config/labels";
import { cn } from "@/lib/utils";
import type { listResidents } from "@/services/resident/resident-service";
import { bulkResidentStatusAction } from "@/app/(app)/residents/actions";
import { ResidentAvatar } from "./resident-avatar";

export type ResidentsData = Awaited<ReturnType<typeof listResidents>>;
export type ResidentRow = ResidentsData["items"][number];

export function ResidentsTable({
  data,
  filters,
  toolbar,
  empty,
  showHostel,
}: {
  data: ResidentsData;
  filters: FilterDef[];
  toolbar?: React.ReactNode;
  empty?: React.ReactNode;
  showHostel: boolean;
}) {
  const fmt = useFormatters();
  const can = useCan();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const canManage = can("residents.manage");
  const canAssign = can("assignments.manage");

  const name = (r: ResidentRow) => `${r.firstName} ${r.lastName}`;

  const columns: Column<ResidentRow>[] = [
    {
      id: "name",
      header: "Name",
      sortKey: "name",
      hideable: false,
      cell: (r) => (
        <Link href={`/residents/${r.id}`} className="flex min-w-0 items-center gap-3 hover:text-primary">
          <ResidentAvatar name={name(r)} photoFileId={r.photoFileId} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{name(r)}</span>
            <span className="block truncate font-mono text-xs text-muted-foreground">{r.residentCode}</span>
          </span>
        </Link>
      ),
    },
    {
      id: "phone",
      header: "Phone",
      cell: (r) => (
        <a href={`tel:${r.phone}`} className="tabular whitespace-nowrap hover:text-primary">
          {r.phone}
        </a>
      ),
    },
    ...(showHostel ? [{ id: "hostel", header: "Hostel", sortKey: "hostel", cell: (r: ResidentRow) => r.hostel.name }] : []),
    {
      id: "room",
      header: "Room",
      cell: (r) =>
        r.stay ? (
          <span className="whitespace-nowrap">
            {r.stay.room.roomNumber}
            {r.stay.status === "RESERVED" ? <span className="ms-1.5 text-xs text-violet">{assignmentStatusLabels.RESERVED}</span> : null}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { id: "bed", header: "Bed", cell: (r) => (r.stay ? r.stay.bed.bedNumber : <span className="text-muted-foreground">—</span>) },
    {
      id: "rent",
      header: "Rent",
      align: "end",
      cell: (r) => (r.stay ? fmt.money(r.stay.monthlyRent) : <span className="text-muted-foreground">—</span>),
    },
    ...(data.showBalance
      ? [
          {
            id: "balance",
            header: "Balance",
            align: "end" as const,
            cell: (r: ResidentRow) => {
              const b = r.balance?.balance ?? 0;
              return (
                <span className={cn("tabular", b > 0 && "font-medium text-danger", b < 0 && "text-success")}>
                  {b < 0 ? `${fmt.money(-b)} cr` : fmt.money(b)}
                </span>
              );
            },
          },
        ]
      : []),
    {
      id: "status",
      header: "Status",
      sortKey: "status",
      cell: (r) => <EnumBadge value={r.status} labels={residentStatusLabels} tones={residentStatusTones} />,
    },
    { id: "joined", header: "Joined", sortKey: "joined", defaultHidden: true, cell: (r) => fmt.date(r.joiningDate) },
    { id: "email", header: "Email", defaultHidden: true, cell: (r) => r.email ?? <span className="text-muted-foreground">—</span> },
    {
      id: "actions",
      header: "",
      hideable: false,
      hideOnMobile: true,
      className: "w-10",
      cell: (r) => <RowActions row={r} canManage={canManage} canAssign={canAssign} />,
    },
  ];

  const runBulk = (status: "NOTICE" | "ACTIVE", label: string) => async (ids: string[]) =>
    new Promise<void>((resolve) =>
      startTransition(async () => {
        try {
          const res = await bulkResidentStatusAction({ residentIds: ids, status });
          if (res.ok) {
            toast.success(
              `${res.data.updated} resident${res.data.updated === 1 ? "" : "s"} ${label}` +
                (res.data.skipped ? ` · ${res.data.skipped} skipped` : ""),
            );
            router.refresh();
          } else toast.error(res.error);
        } catch {
          toast.error("Could not reach the server. Please try again.");
        } finally {
          resolve();
        }
      }),
    );

  const bulkActions: BulkAction[] = canManage
    ? [
        { label: "Mark on notice", icon: <BellRing />, onRun: runBulk("NOTICE", "marked on notice") },
        { label: "Mark active", icon: <UserCheck />, onRun: runBulk("ACTIVE", "marked active") },
      ]
    : [];

  return (
    <DataTable
      rows={data.items}
      columns={columns}
      getRowId={(r) => r.id}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      pageSize={data.pageSize}
      rowHref={(r) => `/residents/${r.id}`}
      searchPlaceholder="Search name, code, phone, email or CNIC"
      filters={filters}
      toolbar={toolbar}
      bulkActions={bulkActions}
      storageKey="residents"
      empty={empty}
      mobileCard={(r) => (
        <div className="flex items-start gap-3">
          <ResidentAvatar name={name(r)} photoFileId={r.photoFileId} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{name(r)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.residentCode} · {r.phone}
                </p>
              </div>
              <EnumBadge value={r.status} labels={residentStatusLabels} tones={residentStatusTones} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {r.stay ? (
                <span>
                  Room {r.stay.room.roomNumber} · Bed {r.stay.bed.bedNumber}
                  {r.stay.status === "RESERVED" ? " (reserved)" : ""}
                </span>
              ) : (
                <StatusBadge tone="neutral" dot={false}>
                  No bed
                </StatusBadge>
              )}
              {showHostel ? <span>{r.hostel.name}</span> : null}
              {r.stay ? <span className="tabular">{fmt.money(r.stay.monthlyRent)}/mo</span> : null}
              {data.showBalance && (r.balance?.balance ?? 0) > 0 ? (
                <span className="tabular font-medium text-danger">Due {fmt.money(r.balance!.balance)}</span>
              ) : null}
            </div>
          </div>
        </div>
      )}
    />
  );
}

function RowActions({ row, canManage, canAssign }: { row: ResidentRow; canManage: boolean; canAssign: boolean }) {
  const archived = row.status === "ARCHIVED";
  const live = row.stay;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${row.firstName} ${row.lastName}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href={`/residents/${row.id}`}>
            <Eye />
            View profile
          </Link>
        </DropdownMenuItem>
        {canManage && !archived ? (
          <DropdownMenuItem asChild>
            <Link href={`/residents/${row.id}/edit`}>
              <Pencil />
              Edit
            </Link>
          </DropdownMenuItem>
        ) : null}
        {canAssign && !archived && row.status !== "SUSPENDED" ? (
          <>
            <DropdownMenuSeparator />
            {!live ? (
              <DropdownMenuItem asChild>
                <Link href={`/residents/check-in?residentId=${row.id}`}>
                  <LogIn />
                  Check in
                </Link>
              </DropdownMenuItem>
            ) : live.status === "ACTIVE" ? (
              <>
                <DropdownMenuItem asChild>
                  <Link href={`/residents/${row.id}?transfer=1`}>
                    <ArrowRightLeft />
                    Transfer
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/residents/check-out?residentId=${row.id}`}>
                    <LogOut />
                    Check out
                  </Link>
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem asChild>
                <Link href={`/residents/${row.id}`}>
                  <LogIn />
                  Manage reservation
                </Link>
              </DropdownMenuItem>
            )}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
