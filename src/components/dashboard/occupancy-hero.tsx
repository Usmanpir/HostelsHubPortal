import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { OccupancyBar } from "@/components/hostels/occupancy-bar";
import type { OccupancyStats } from "@/services/hostel/occupancy";
import { cn } from "@/lib/utils";

/** The dashboard's single hero figure: occupancy rate. */
export function OccupancyHero({ stats, href, className }: { stats: OccupancyStats; href?: string; className?: string }) {
  const usable = stats.totalBeds - stats.maintenanceBeds - stats.inactiveBeds;
  return (
    <div className={cn("flex flex-col justify-between gap-5 rounded-xl border bg-card p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">Occupancy</span>
        {href ? (
          <Link href={href} className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            Report
            <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
          </Link>
        ) : null}
      </div>
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-semibold tracking-tight">{stats.occupancyRate}%</span>
          <span className="text-sm text-muted-foreground">occupied</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {stats.occupiedBeds.toLocaleString()} of {usable.toLocaleString()} usable beds
          {stats.maintenanceBeds ? ` · ${stats.maintenanceBeds} in maintenance` : ""}
        </p>
      </div>
      <OccupancyBar stats={stats} showLegend />
    </div>
  );
}
