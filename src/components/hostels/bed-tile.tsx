"use client";

import { BedDouble, BedSingle, Wrench } from "lucide-react";
import type { BedStatus } from "@/generated/prisma/enums";
import { bedStatusLabels } from "@/config/labels";
import { cn } from "@/lib/utils";

export const bedToneClasses: Record<BedStatus, string> = {
  AVAILABLE: "border-success/30 bg-success-soft text-success hover:border-success/60",
  OCCUPIED: "border-info/30 bg-info-soft text-info hover:border-info/60",
  RESERVED: "border-violet/30 bg-violet-soft text-violet hover:border-violet/60",
  MAINTENANCE: "border-warning/30 bg-warning-soft text-warning hover:border-warning/60",
  INACTIVE: "border-border bg-muted text-muted-foreground hover:border-foreground/20",
};

export type BedTileData = {
  id: string;
  bedNumber: string;
  status: BedStatus;
  residentName?: string | null;
  /** Tile heading; defaults to "Bed N". Whole units pass "Unit 101". */
  label?: string;
};

export function BedTile({ bed, onClick, compact }: { bed: BedTileData; onClick?: () => void; compact?: boolean }) {
  const Icon = bed.status === "MAINTENANCE" ? Wrench : bed.status === "OCCUPIED" ? BedDouble : BedSingle;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg border px-2.5 text-start text-xs transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        compact ? "h-9" : "h-12",
        bedToneClasses[bed.status],
      )}
      aria-label={`${bed.label ?? `Bed ${bed.bedNumber}`}: ${bedStatusLabels[bed.status]}${bed.residentName ? `, ${bed.residentName}` : ""}`}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-semibold">{bed.label ?? `Bed ${bed.bedNumber}`}</span>
        {!compact ? (
          <span className="truncate opacity-80">{bed.residentName ?? bedStatusLabels[bed.status]}</span>
        ) : null}
      </span>
    </button>
  );
}
