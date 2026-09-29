"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUrlState } from "@/hooks/use-url-state";
import { statementPresetLabels, type StatementPreset } from "@/config/owner-labels";
import { detectPreset, presetPeriod } from "@/services/owners/period";
import { cn } from "@/lib/utils";

const PRESETS: StatementPreset[] = ["last_month", "this_month", "custom"];

/** Period selector bound to `?from=&to=`. No params = last full month. */
export function StatementPeriodPicker({ from, to, today }: { from: string; to: string; today: string }) {
  const url = useUrlState();
  const preset = detectPreset({ from, to }, today);
  const [showCustom, setShowCustom] = useState(preset === "custom");
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  const choose = (value: string) => {
    if (!value) return;
    if (value === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    const p = presetPeriod(value as Exclude<StatementPreset, "custom">, today);
    setCustomFrom(p.from);
    setCustomTo(p.to);
    url.set(value === "last_month" ? { from: null, to: null } : { from: p.from, to: p.to });
  };

  const apply = () => {
    if (!customFrom || !customTo) return;
    const [a, b] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
    url.set({ from: a, to: b });
  };

  return (
    <div className={cn("no-print flex flex-col gap-3 rounded-xl border bg-card p-3 md:flex-row md:items-center", url.pending && "opacity-70")}>
      <div className="-mx-1 overflow-x-auto px-1">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={showCustom ? "custom" : preset}
          onValueChange={choose}
          aria-label="Statement period"
        >
          {PRESETS.map((p) => (
            <ToggleGroupItem key={p} value={p} className="px-3 whitespace-nowrap">
              {statementPresetLabels[p]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {showCustom ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <Input
            type="date"
            value={customFrom}
            max={today}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="h-8 w-[9.5rem]"
            aria-label="From"
            required
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="h-8 w-[9.5rem]"
            aria-label="To"
            required
          />
          <Button type="submit" size="sm" disabled={!customFrom || !customTo}>
            Apply
          </Button>
        </form>
      ) : null}
    </div>
  );
}
