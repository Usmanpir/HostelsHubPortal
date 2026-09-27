"use client";

import Link from "next/link";
import { Camera } from "lucide-react";
import { EnumBadge, dotClasses } from "@/components/shared/status-badge";
import { maintenanceCategoryLabels, maintenanceStatusLabels, maintenanceStatusTones, priorityLabels, priorityTones } from "@/config/labels";
import type { MaintenanceStatus } from "@/generated/prisma/enums";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { locationLabel, type MaintenanceRow } from "./maintenance-table";

export type BoardColumn = { status: MaintenanceStatus; items: MaintenanceRow[]; total: number };

/** Kanban-style status board. Scrolls horizontally on phones. */
export function MaintenanceBoard({ columns, showHostel }: { columns: BoardColumn[]; showHostel: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-[1100px] grid-cols-5 gap-3">
        {columns.map((col) => (
          <section key={col.status} className="flex min-h-40 flex-col rounded-xl border bg-muted/30">
            <header className="flex items-center gap-2 border-b px-3 py-2.5">
              <span className={cn("size-2 rounded-full", dotClasses[maintenanceStatusTones[col.status]])} />
              <h2 className="text-sm font-semibold">{maintenanceStatusLabels[col.status]}</h2>
              <span className="ms-auto rounded-full bg-background px-2 text-xs tabular text-muted-foreground">{col.total}</span>
            </header>
            <div className="flex flex-col gap-2 p-2">
              {col.items.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nothing here</p>
              ) : (
                col.items.map((r) => (
                  <Link
                    key={r.id}
                    href={`/operations/maintenance/${r.id}`}
                    className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-xs transition-colors hover:border-primary/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 font-medium">{r.title}</span>
                      <EnumBadge value={r.priority} labels={priorityLabels} tones={priorityTones} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{r.requestNumber}</span> · {locationLabel(r)}
                      {showHostel ? ` · ${r.hostel.code}` : ""}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{maintenanceCategoryLabels[r.category]}</span>
                      {r._count.photos ? (
                        <span className="inline-flex items-center gap-0.5">
                          <Camera className="size-3" />
                          {r._count.photos}
                        </span>
                      ) : null}
                      <span className="ms-auto">{formatRelative(r.createdAt)}</span>
                    </div>
                    <p className="truncate text-xs">
                      {r.assignedStaff ? `${r.assignedStaff.firstName} ${r.assignedStaff.lastName}` : <span className="text-muted-foreground">Unassigned</span>}
                    </p>
                  </Link>
                ))
              )}
              {col.total > col.items.length ? (
                <Link href={`/operations/maintenance?status=${col.status}`} className="px-1 py-1 text-center text-xs text-muted-foreground hover:text-primary">
                  View all {col.total}
                </Link>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
