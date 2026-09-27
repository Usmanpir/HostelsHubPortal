"use client";

import Link from "next/link";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { EnumBadge } from "@/components/shared/status-badge";
import { useFormatters } from "@/components/shared/org-context";
import { bedStatusLabels, bedStatusTones } from "@/config/labels";
import type { AssignmentStatus, BedStatus } from "@/generated/prisma/enums";
import type { Paginated } from "@/lib/validation/common";

export type BedRow = {
  id: string;
  bedNumber: string;
  status: BedStatus;
  monthlyRent: number | null;
  hostel: { id: string; name: string };
  room: { id: string; roomNumber: string; rent: number | null; floor: { name: string } };
  assignments: { id: string; status: AssignmentStatus; resident: { id: string; firstName: string; lastName: string } }[];
};

export function BedsTable({ data, filters }: { data: Paginated<BedRow>; filters: FilterDef[] }) {
  const fmt = useFormatters();
  const columns: Column<BedRow>[] = [
    {
      id: "bed",
      header: "Bed",
      hideable: false,
      cell: (b) => (
        <Link href={`/hostels/rooms/${b.room.id}`} className="font-medium hover:text-primary">
          Room {b.room.roomNumber} · Bed {b.bedNumber}
        </Link>
      ),
    },
    { id: "hostel", header: "Hostel", cell: (b) => b.hostel.name },
    { id: "floor", header: "Floor", cell: (b) => b.room.floor.name },
    {
      id: "resident",
      header: "Resident",
      cell: (b) => {
        const a = b.assignments[0];
        return a ? (
          <Link href={`/residents/${a.resident.id}`} className="hover:text-primary">
            {a.resident.firstName} {a.resident.lastName}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "rent",
      header: "Rent",
      align: "end",
      cell: (b) => {
        const rent = b.monthlyRent ?? b.room.rent;
        return rent !== null ? fmt.money(rent) : <span className="text-muted-foreground">Default</span>;
      },
    },
    { id: "status", header: "Status", cell: (b) => <EnumBadge value={b.status} labels={bedStatusLabels} tones={bedStatusTones} /> },
  ];
  return (
    <DataTable
      rows={data.items}
      columns={columns}
      getRowId={(b) => b.id}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      pageSize={data.pageSize}
      rowHref={(b) => `/hostels/rooms/${b.room.id}`}
      searchPlaceholder="Search room or bed number"
      filters={filters}
      storageKey="beds"
    />
  );
}
