"use client";

import Link from "next/link";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { EnumBadge } from "@/components/shared/status-badge";
import { useFormatters } from "@/components/shared/org-context";
import { roomStatusLabels, roomStatusTones, roomTypeLabels } from "@/config/labels";
import type { RoomStatus, RoomType } from "@/generated/prisma/enums";
import type { Paginated } from "@/lib/validation/common";

export type RoomRow = {
  id: string;
  roomNumber: string;
  roomType: RoomType;
  capacity: number;
  status: RoomStatus;
  rent: number | null;
  hostel: { id: string; name: string };
  floor: { id: string; name: string };
  bedCount: number;
  occupiedCount: number;
  availableCount: number;
};

export function RoomsTable({ data, filters, empty }: { data: Paginated<RoomRow>; filters: FilterDef[]; empty?: React.ReactNode }) {
  const fmt = useFormatters();
  const columns: Column<RoomRow>[] = [
    {
      id: "room",
      header: "Room",
      hideable: false,
      cell: (r) => (
        <Link href={`/hostels/rooms/${r.id}`} className="font-medium hover:text-primary">
          Room {r.roomNumber}
        </Link>
      ),
    },
    { id: "hostel", header: "Hostel", cell: (r) => r.hostel.name },
    { id: "floor", header: "Floor", cell: (r) => r.floor.name },
    { id: "type", header: "Type", cell: (r) => roomTypeLabels[r.roomType] },
    {
      id: "beds",
      header: "Occupancy",
      cell: (r) => (
        <span className="tabular">
          {r.occupiedCount}/{r.bedCount} <span className="text-muted-foreground">beds</span>
          {r.bedCount < r.capacity ? <span className="text-xs text-muted-foreground"> (cap {r.capacity})</span> : null}
        </span>
      ),
    },
    { id: "rent", header: "Rent / bed", align: "end", cell: (r) => (r.rent !== null ? fmt.money(r.rent) : <span className="text-muted-foreground">Default</span>) },
    { id: "status", header: "Status", cell: (r) => <EnumBadge value={r.status} labels={roomStatusLabels} tones={roomStatusTones} /> },
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
      rowHref={(r) => `/hostels/rooms/${r.id}`}
      searchPlaceholder="Search room number"
      filters={filters}
      storageKey="rooms"
      empty={empty}
    />
  );
}
