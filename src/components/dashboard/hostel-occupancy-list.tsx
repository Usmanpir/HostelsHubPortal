import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OccupancyStats } from "@/services/hostel/occupancy";
import type { DashboardWords } from "./dashboard-words";

export function HostelOccupancyList({
  hostels,
  linkHostels,
  words: w,
}: {
  hostels: { id: string; name: string; code: string; occupancy: OccupancyStats }[];
  linkHostels: boolean;
  words: DashboardWords;
}) {
  const sorted = [...hostels].sort((a, b) => b.occupancy.occupancyRate - a.occupancy.occupancyRate);
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Occupancy by {w.property}</CardTitle>
        <CardDescription>Occupied share of usable {w.capacity}</CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No {w.properties} in this view.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {sorted.map((h) => {
              const o = h.occupancy;
              const usable = o.totalBeds - o.maintenanceBeds - o.inactiveBeds;
              const name = (
                <span className="truncate font-medium">
                  {h.name} <span className="font-normal text-muted-foreground">· {h.code}</span>
                </span>
              );
              return (
                <li key={h.id} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    {linkHostels ? (
                      <Link href={`/hostels/${h.id}`} className="min-w-0 truncate hover:text-primary">
                        {name}
                      </Link>
                    ) : (
                      name
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      <span className="tabular font-semibold text-foreground">{o.occupancyRate}%</span> · {o.occupiedBeds}/{usable} {w.capacity}
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-info-soft"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={o.occupancyRate}
                    aria-label={`${h.name} occupancy`}
                  >
                    <div className="h-full rounded-full bg-info" style={{ width: `${Math.min(100, o.occupancyRate)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
