import type { OccupancyStats } from "@/services/hostel/occupancy";
import { cn } from "@/lib/utils";

/** Stacked bar of bed statuses with the occupancy rate. */
export function OccupancyBar({ stats, className, showLegend = false }: { stats: OccupancyStats | null; className?: string; showLegend?: boolean }) {
  const total = stats?.totalBeds ?? 0;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  const segments = stats
    ? [
        { key: "Occupied", value: stats.occupiedBeds, className: "bg-info" },
        { key: "Reserved", value: stats.reservedBeds, className: "bg-violet" },
        { key: "Maintenance", value: stats.maintenanceBeds, className: "bg-warning" },
        { key: "Available", value: stats.availableBeds, className: "bg-success/70" },
      ]
    : [];
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">Occupancy</span>
        <span className="tabular font-semibold">{stats ? `${stats.occupancyRate}%` : "—"}</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Occupancy ${stats?.occupancyRate ?? 0}%`}>
        {segments.map((s) => (s.value ? <span key={s.key} className={s.className} style={{ width: `${pct(s.value)}%` }} /> : null))}
      </div>
      {showLegend && stats ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {segments.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", s.className)} />
              {s.key} <span className="tabular text-foreground">{s.value}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
