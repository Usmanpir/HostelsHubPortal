import Link from "next/link";
import { Building2, MapPin } from "lucide-react";
import { EnumBadge } from "@/components/shared/status-badge";
import { hostelStatusLabels, hostelStatusTones, hostelTypeLabels } from "@/config/labels";
import type { HostelStatus, HostelType, PropertyKind, RentalMode } from "@/generated/prisma/enums";
import { PROPERTY_KIND_LABELS, termsFor, type Terms } from "@/lib/terms";
import type { OccupancyStats } from "@/services/hostel/occupancy";
import { OccupancyBar } from "./occupancy-bar";

export type HostelCardData = {
  id: string;
  name: string;
  code: string;
  city: string | null;
  type: HostelType;
  kind?: PropertyKind;
  rentalMode?: RentalMode;
  status: HostelStatus;
  occupancy: OccupancyStats | null;
  _count: { floors: number; rooms: number };
  manager: { firstName: string; lastName: string } | null;
};

export function HostelCard({ hostel, terms = termsFor("HOSTELS") }: { hostel: HostelCardData; terms?: Terms }) {
  const whole = hostel.rentalMode === "WHOLE_UNIT";
  const o = hostel.occupancy;
  return (
    <Link
      href={`/hostels/${hostel.id}`}
      className="group flex flex-col gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-accent/20"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Building2 className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold group-hover:text-primary">{hostel.name}</h3>
          </div>
          <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
            <span className="font-mono text-xs">{hostel.code}</span>
            {hostel.city ? (
              <>
                <span>·</span>
                <MapPin className="size-3" />
                {hostel.city}
              </>
            ) : null}
          </p>
        </div>
        <EnumBadge value={hostel.status} labels={hostelStatusLabels} tones={hostelStatusTones} />
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {(whole
          ? [
              ["Floors", hostel._count.floors],
              ["Units", hostel._count.rooms],
              ["Vacant", o?.availableBeds ?? 0],
            ]
          : [
              ["Floors", hostel._count.floors],
              [terms.units, hostel._count.rooms],
              ["Beds", o?.totalBeds ?? 0],
            ]
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg bg-muted/50 py-2">
            <dd className="tabular text-lg font-semibold">{value}</dd>
            <dt className="text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      <OccupancyBar stats={hostel.occupancy} />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{hostel.kind && hostel.kind !== "HOSTEL" ? PROPERTY_KIND_LABELS[hostel.kind] : hostelTypeLabels[hostel.type]}</span>
        <span className="truncate">
          {hostel.manager ? `Manager: ${hostel.manager.firstName} ${hostel.manager.lastName}` : "No manager assigned"}
        </span>
      </div>
    </Link>
  );
}
