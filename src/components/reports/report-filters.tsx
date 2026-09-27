"use client";

import { useState } from "react";
import { CalendarRange, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUrlState } from "@/hooks/use-url-state";
import { cn } from "@/lib/utils";
import { RANGE_PRESETS, type RangePreset } from "@/services/reports/range";
import { useValueFormat } from "./use-value-format";

const DEFAULT = "__default__";

export type FilterBarProps = {
  usesDateRange: boolean;
  dateLabel?: string;
  from: string;
  to: string;
  preset: RangePreset;
  hostelId: string | null;
  status: string | null;
  hostels: { id: string; name: string }[];
  defaultHostelLabel: string;
  statusFilter?: { label: string; options: { value: string; label: string }[] };
};

/** Date range (presets + custom), hostel and status filters, all in the URL. */
export function ReportFilters(props: FilterBarProps) {
  const url = useUrlState();
  const fmt = useValueFormat();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(props.from);
  const [to, setTo] = useState(props.to);
  const invalid = !from || !to || from > to;

  const rangeLabel = `${fmt.value("date", props.from)} – ${fmt.value("date", props.to)}`;

  return (
    <div className={cn("no-print flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", url.pending && "opacity-70")}>
      {props.usesDateRange ? (
        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (o) {
              setFrom(props.from);
              setTo(props.to);
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-start sm:min-w-64">
              <CalendarRange />
              <span className="text-muted-foreground">{props.dateLabel ?? "Period"}:</span>
              <span className="tabular truncate">{rangeLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-1">
            <div className="flex flex-col" role="listbox" aria-label="Date range presets">
              {RANGE_PRESETS.filter((p) => p.key !== "custom").map((p) => {
                const selected = props.preset === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-start text-sm hover:bg-accent/60"
                    onClick={() => {
                      setOpen(false);
                      url.set({ range: p.key, from: null, to: null });
                    }}
                  >
                    <span className={cn(selected && "font-medium")}>{p.label}</span>
                    {selected ? <Check className="size-4 stroke-[2.5]" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-1 flex flex-col gap-2 border-t p-2">
              <span className="text-xs font-medium text-muted-foreground">Custom range</span>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="report-from" className="text-xs">
                    From
                  </Label>
                  <Input id="report-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="report-to" className="text-xs">
                    To
                  </Label>
                  <Input id="report-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
              <Button
                size="sm"
                disabled={invalid}
                onClick={() => {
                  setOpen(false);
                  url.set({ range: "custom", from, to });
                }}
              >
                Apply range
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}

      {props.hostels.length > 1 ? (
        <Select value={props.hostelId ?? DEFAULT} onValueChange={(v) => url.set({ hostelId: v === DEFAULT ? null : v })}>
          <SelectTrigger className="sm:w-56" aria-label="Hostel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT}>{props.defaultHostelLabel}</SelectItem>
            {props.hostels.map((h) => (
              <SelectItem key={h.id} value={h.id}>
                {h.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {props.statusFilter ? (
        <Select value={props.status ?? DEFAULT} onValueChange={(v) => url.set({ status: v === DEFAULT ? null : v })}>
          <SelectTrigger className="sm:w-44" aria-label={props.statusFilter.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT}>All statuses</SelectItem>
            {props.statusFilter.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
