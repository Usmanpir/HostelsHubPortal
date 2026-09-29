import Link from "next/link";
import { ArrowRightLeft, BedDouble, CalendarClock, CalendarX, LogOut } from "lucide-react";
import { EnumBadge } from "@/components/shared/status-badge";
import { assignmentStatusLabels, assignmentStatusTones } from "@/config/labels";
import type { AssignmentStatus } from "@/generated/prisma/enums";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { termsFor, type Terms } from "@/lib/terms";

export type TimelineStay = {
  id: string;
  status: AssignmentStatus;
  checkInDate: Date;
  checkOutDate: Date | null;
  monthlyRent: number;
  securityDeposit: number;
  finalCharges: number | null;
  depositDeduction: number | null;
  depositRefund: number | null;
  meterReading: string | null;
  endReason: string | null;
  notes: string | null;
  hostel: { id: string; name: string; rentalMode?: string };
  room: { id: string; roomNumber: string; floor: { name: string } };
  bed: { id: string; bedNumber: string };
  createdBy: { name: string } | null;
};

const ICONS: Record<AssignmentStatus, typeof BedDouble> = {
  ACTIVE: BedDouble,
  RESERVED: CalendarClock,
  TRANSFERRED: ArrowRightLeft,
  COMPLETED: LogOut,
  CANCELLED: CalendarX,
};

function nights(from: Date, to: Date) {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400_000));
}

function durationLabel(days: number) {
  if (days < 1) return "Same day";
  if (days < 60) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30.44);
  return `${months} month${months === 1 ? "" : "s"}`;
}

/** Preserved stay history: every bed the resident has occupied, newest first. */
export function StayTimeline({
  stays,
  currency,
  locale,
  showRoomLinks,
  terms,
}: {
  stays: TimelineStay[];
  currency: string;
  locale?: string;
  showRoomLinks: boolean;
  terms?: Terms;
}) {
  const t = terms ?? termsFor("HOSTELS");
  if (stays.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
        {t.property === "Hostel"
          ? "No stays yet. Check the resident in to assign a bed."
          : `No ${t.stays.toLowerCase()} yet. Move the ${t.resident.toLowerCase()} in to assign a unit.`}
      </p>
    );
  }
  const money = (n: number) => formatMoney(n, currency, locale);
  return (
    <ol className="relative flex flex-col gap-0 px-4 py-4">
      {stays.map((s, i) => {
        const Icon = ICONS[s.status];
        const live = s.status === "ACTIVE" || s.status === "RESERVED";
        const end = s.checkOutDate ?? (s.status === "ACTIVE" ? new Date() : null);
        const room =
          s.hostel.rentalMode === "WHOLE_UNIT" ? `Unit ${s.room.roomNumber}` : `${t.unit} ${s.room.roomNumber} · Bed ${s.bed.bedNumber}`;
        return (
          <li key={s.id} className="relative flex gap-4 pb-6 last:pb-0">
            {i < stays.length - 1 ? <span className="absolute start-4 top-9 bottom-0 w-px bg-border" aria-hidden /> : null}
            <span
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-card",
                s.status === "ACTIVE" && "border-success/40 bg-success-soft text-success",
                s.status === "RESERVED" && "border-violet/40 bg-violet-soft text-violet",
                !live && "text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 rounded-xl border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {showRoomLinks ? (
                      <Link href={`/hostels/rooms/${s.room.id}`} className="hover:text-primary">
                        {room}
                      </Link>
                    ) : (
                      room
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.hostel.name} · {s.room.floor.name}
                  </p>
                </div>
                <EnumBadge value={s.status} labels={assignmentStatusLabels} tones={assignmentStatusTones} />
              </div>
              <p className="mt-2 text-sm">
                <span className="tabular">{formatDate(s.checkInDate, locale)}</span>
                <span className="mx-1.5 text-muted-foreground">→</span>
                <span className="tabular">
                  {s.checkOutDate ? formatDate(s.checkOutDate, locale) : s.status === "ACTIVE" ? "Present" : s.status === "RESERVED" ? "Move-in pending" : "—"}
                </span>
                {end && s.status !== "CANCELLED" ? (
                  <span className="ms-2 text-xs text-muted-foreground">{durationLabel(nights(s.checkInDate, end))}</span>
                ) : null}
              </p>
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <div>
                  <dt className="inline">Rent </dt>
                  <dd className="tabular inline font-medium text-foreground">{money(s.monthlyRent)}</dd>
                </div>
                <div>
                  <dt className="inline">Deposit </dt>
                  <dd className="tabular inline font-medium text-foreground">{money(s.securityDeposit)}</dd>
                </div>
                {s.finalCharges !== null ? (
                  <div>
                    <dt className="inline">Final charges </dt>
                    <dd className="tabular inline font-medium text-foreground">{money(s.finalCharges)}</dd>
                  </div>
                ) : null}
                {s.depositDeduction ? (
                  <div>
                    <dt className="inline">Deducted </dt>
                    <dd className="tabular inline font-medium text-foreground">{money(s.depositDeduction)}</dd>
                  </div>
                ) : null}
                {s.depositRefund ? (
                  <div>
                    <dt className="inline">Refunded </dt>
                    <dd className="tabular inline font-medium text-foreground">{money(s.depositRefund)}</dd>
                  </div>
                ) : null}
                {s.meterReading ? (
                  <div>
                    <dt className="inline">Meter </dt>
                    <dd className="inline font-medium text-foreground">{s.meterReading}</dd>
                  </div>
                ) : null}
              </dl>
              {s.endReason ? <p className="mt-2 text-xs text-muted-foreground">{s.endReason}</p> : null}
              {s.notes ? <p className="mt-1 text-xs whitespace-pre-line text-muted-foreground">{s.notes}</p> : null}
              {s.createdBy ? <p className="mt-2 text-[11px] text-muted-foreground/80">Recorded by {s.createdBy.name}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
