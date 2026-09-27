"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUrlState } from "@/hooks/use-url-state";
import type { FinanceRangePreset } from "@/lib/validation/finance";
import { cn } from "@/lib/utils";

const PRESETS: { value: FinanceRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
];

/** One filter row scoping every KPI and chart on the finance overview. */
export function FinanceRangeFilter({
  preset,
  from,
  to,
  label,
  scopeLabel,
}: {
  preset: FinanceRangePreset;
  from: string;
  to: string;
  label: string;
  scopeLabel: string;
}) {
  const url = useUrlState();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const [showCustom, setShowCustom] = useState(preset === "custom");

  const choose = (value: string) => {
    if (!value) return;
    if (value === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    url.set({ range: value === "month" ? null : value, from: null, to: null });
  };

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    const [a, b] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
    url.set({ range: "custom", from: a, to: b });
  };

  return (
    <div className={cn("mb-4 flex flex-col gap-3 rounded-xl border bg-card p-3 lg:flex-row lg:items-center", url.pending && "opacity-70")}>
      <div className="-mx-1 overflow-x-auto px-1">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={showCustom ? "custom" : preset}
          onValueChange={choose}
          aria-label="Date range"
        >
          {PRESETS.map((p) => (
            <ToggleGroupItem key={p.value} value={p.value} className="px-3 whitespace-nowrap">
              {p.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {showCustom ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            applyCustom();
          }}
        >
          <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-7 w-[8.75rem] text-xs" aria-label="From" required />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-7 w-[8.75rem] text-xs" aria-label="To" required />
          <Button type="submit" size="sm" disabled={!customFrom || !customTo}>
            Apply
          </Button>
        </form>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm lg:ms-auto">
        <span className="font-medium">{label}</span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Building2 className="size-3.5" />
          {scopeLabel}
        </span>
      </div>
    </div>
  );
}
