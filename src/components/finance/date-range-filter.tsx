"use client";

import { CalendarRange, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUrlState } from "@/hooks/use-url-state";

/** From/to date inputs bound to `?from=&to=` (YYYY-MM-DD). Used in list toolbars. */
export function DateRangeFilter({ label = "Date" }: { label?: string }) {
  const url = useUrlState();
  const from = url.get("from");
  const to = url.get("to");
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={`${label} range`}>
      <CalendarRange className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
      <Input
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => url.set({ from: e.target.value || null })}
        className="h-7 w-[8.75rem] text-xs"
        aria-label={`${label} from`}
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => url.set({ to: e.target.value || null })}
        className="h-7 w-[8.75rem] text-xs"
        aria-label={`${label} to`}
      />
      {from || to ? (
        <Button variant="ghost" size="icon-sm" onClick={() => url.set({ from: null, to: null })} aria-label="Clear dates">
          <X />
        </Button>
      ) : null}
    </div>
  );
}
