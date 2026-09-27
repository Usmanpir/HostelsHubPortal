"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUrlState } from "@/hooks/use-url-state";
import { monthKey, shiftMonth } from "@/lib/validation/staff";
import { cn } from "@/lib/utils";
import { monthLabel } from "./staff-format";

const ALL = "__all__";

/** Hostel filter stored in the URL (`?hostel=`). Hidden when there's nothing to choose. */
export function HostelScopeSelect({
  hostels,
  allowAll,
  value,
  className,
}: {
  hostels: { id: string; name: string }[];
  allowAll: boolean;
  value: string | null;
  className?: string;
}) {
  const url = useUrlState();
  if (hostels.length <= 1 && !allowAll) return null;
  if (hostels.length === 0) return null;
  return (
    <Select value={value ?? ALL} onValueChange={(v) => url.set({ hostel: v === ALL ? null : v })}>
      <SelectTrigger className={cn("w-full sm:w-52", className)} aria-label="Hostel">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowAll ? <SelectItem value={ALL}>All hostels</SelectItem> : null}
        {hostels.map((h) => (
          <SelectItem key={h.id} value={h.id}>
            {h.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Previous / next month navigation stored in `?month=YYYY-MM`. */
export function MonthNav({
  year,
  month,
  current,
  allowFuture = false,
}: {
  year: number;
  month: number;
  /** The organization's current month, for the "This month" shortcut and the future limit. */
  current: { year: number; month: number };
  allowFuture?: boolean;
}) {
  const url = useUrlState();
  const go = (p: { year: number; month: number }) => {
    const isCurrent = p.year === current.year && p.month === current.month;
    url.set({ month: isCurrent ? null : monthKey(p.year, p.month) });
  };
  const next = shiftMonth(year, month, 1);
  const atCurrent = year === current.year && month === current.month;
  const nextDisabled = !allowFuture && next.year * 12 + next.month > current.year * 12 + current.month;
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="icon" onClick={() => go(shiftMonth(year, month, -1))} aria-label="Previous month">
        <ChevronLeft className="rtl:rotate-180" />
      </Button>
      <div className="flex h-8 min-w-40 items-center justify-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium">
        <CalendarDays className="size-4 text-muted-foreground" />
        {monthLabel(year, month)}
      </div>
      <Button variant="outline" size="icon" onClick={() => go(next)} disabled={nextDisabled} aria-label="Next month">
        <ChevronRight className="rtl:rotate-180" />
      </Button>
      {!atCurrent ? (
        <Button variant="ghost" size="sm" onClick={() => go(current)}>
          This month
        </Button>
      ) : null}
    </div>
  );
}

function shiftDay(key: string, delta: number) {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Day picker stored in `?date=YYYY-MM-DD`; never goes past `today`. */
export function DayNav({ date, today }: { date: string; today: string }) {
  const url = useUrlState();
  const go = (key: string) => url.set({ date: key === today ? null : key });
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="icon-lg" onClick={() => go(shiftDay(date, -1))} aria-label="Previous day">
        <ChevronLeft className="rtl:rotate-180" />
      </Button>
      <Input
        type="date"
        value={date}
        max={today}
        onChange={(e) => {
          if (e.target.value && e.target.value <= today) go(e.target.value);
        }}
        className="h-9 w-40"
        aria-label="Attendance date"
      />
      <Button variant="outline" size="icon-lg" onClick={() => go(shiftDay(date, 1))} disabled={date >= today} aria-label="Next day">
        <ChevronRight className="rtl:rotate-180" />
      </Button>
      {date !== today ? (
        <Button variant="ghost" size="sm" onClick={() => go(today)}>
          Today
        </Button>
      ) : null}
    </div>
  );
}
