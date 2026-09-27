"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, DoorOpen, LogOut, Phone, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/shared/empty-state";
import { useOrg } from "@/components/shared/org-context";
import { formatRelative, formatTime, formatDate } from "@/lib/format";
import { checkOutVisitorAction } from "@/app/(app)/operations/actions";

export type VisitorRow = {
  id: string;
  name: string;
  phone: string | null;
  idNumber: string | null;
  purpose: string | null;
  notes: string | null;
  checkInAt: Date | string;
  checkOutAt: Date | string | null;
  hostel: { id: string; name: string; code: string };
  resident: { id: string; firstName: string; lastName: string; residentCode: string } | null;
  recordedBy: { id: string; name: string } | null;
};

function isToday(value: Date | string, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(new Date(value)) === fmt.format(new Date());
}

/** Everyone currently on the premises, with a one-tap check-out. */
export function VisitorsInside({ visitors, canManage, showHostel }: { visitors: VisitorRow[]; canManage: boolean; showHostel: boolean }) {
  const org = useOrg();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const checkOut = (v: VisitorRow) => {
    setBusyId(v.id);
    startTransition(async () => {
      try {
        const result = await checkOutVisitorAction(v.id);
        if (result.ok) {
          toast.success(`${v.name} checked out`);
          router.refresh();
        } else toast.error(result.error);
      } catch {
        toast.error("Could not reach the server. Please try again.");
      } finally {
        setBusyId(null);
      }
    });
  };

  if (visitors.length === 0) {
    return <EmptyState icon={DoorOpen} title="No visitors inside" description="Checked-in visitors appear here until they leave." className="py-10" />;
  }

  return (
    <ul className="flex flex-col divide-y rounded-xl border bg-card">
      {visitors.map((v) => {
        const today = isToday(v.checkInAt, org.timezone);
        return (
          <li key={v.id} className="flex items-center gap-3 p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
              <UserRound className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{v.name}</p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {today ? formatTime(v.checkInAt, org.timezone, org.locale) : `${formatDate(v.checkInAt, org.locale)} ${formatTime(v.checkInAt, org.timezone, org.locale)}`}
                  <span>({formatRelative(v.checkInAt, org.locale)})</span>
                </span>
                {v.resident ? <span>→ {v.resident.firstName} {v.resident.lastName}</span> : null}
                {v.purpose ? <span className="truncate">· {v.purpose}</span> : null}
                {showHostel ? <span>· {v.hostel.code}</span> : null}
              </p>
              {v.phone ? (
                <a href={`tel:${v.phone}`} className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                  <Phone className="size-3" />
                  {v.phone}
                </a>
              ) : null}
            </div>
            {canManage ? (
              <Button variant={today ? "outline" : "secondary"} className="h-10 shrink-0 px-3" onClick={() => checkOut(v)} disabled={busyId === v.id}>
                {busyId === v.id ? <Spinner /> : <LogOut />}
                <span>Check out</span>
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
