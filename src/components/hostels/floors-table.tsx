"use client";

import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { useCan, useTerms } from "@/components/shared/org-context";
import { FloorDialog } from "./floor-dialog";
import { archiveFloorAction } from "@/app/(app)/hostels/actions";

type FloorRow = {
  id: string;
  hostelId: string;
  name: string;
  floorNumber: number;
  description: string | null;
  hostel: { id: string; name: string; code: string };
  _count: { rooms: number };
  bedCount: number;
};

export function FloorsTable({
  floors,
  hostels,
  showBeds = true,
}: {
  floors: FloorRow[];
  hostels: { id: string; name: string }[];
  showBeds?: boolean;
}) {
  const can = useCan();
  const t = useTerms();
  const manage = can("rooms.manage");
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>Floor</TableHead>
            <TableHead>{t.property}</TableHead>
            <TableHead className="text-end">{t.units}</TableHead>
            {showBeds ? <TableHead className="text-end">Beds</TableHead> : null}
            {manage ? <TableHead className="w-24 text-end">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {floors.map((f) => (
            <TableRow key={f.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <span className="flex size-7 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular">{f.floorNumber}</span>
                  <div className="min-w-0">
                    <p className="font-medium">{f.name}</p>
                    {f.description ? <p className="truncate text-xs text-muted-foreground">{f.description}</p> : null}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Link href={`/hostels/${f.hostel.id}`} className="hover:text-primary">
                  {f.hostel.name}
                </Link>
              </TableCell>
              <TableCell className="text-end tabular">
                <Link href={`/hostels/rooms?floorId=${f.id}`} className="hover:text-primary">
                  {f._count.rooms}
                </Link>
              </TableCell>
              {showBeds ? <TableCell className="text-end tabular">{f.bedCount}</TableCell> : null}
              {manage ? (
                <TableCell className="text-end">
                  <div className="flex justify-end gap-1">
                    <FloorDialog
                      hostels={hostels}
                      floor={f}
                      trigger={
                        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${f.name}`}>
                          <Pencil />
                        </Button>
                      }
                    />
                    <ConfirmAction
                      trigger={
                        <Button size="icon-sm" variant="ghost" aria-label={`Remove ${f.name}`} disabled={f._count.rooms > 0}>
                          {f._count.rooms > 0 ? <MoreHorizontal className="opacity-40" /> : <Trash2 />}
                        </Button>
                      }
                      title={`Remove ${f.name}?`}
                      description="Only empty floors can be removed."
                      confirmLabel="Remove"
                      destructive
                      action={() => archiveFloorAction(f.id)}
                    />
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
