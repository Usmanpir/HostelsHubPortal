"use client";

import { Columns3, LayoutGrid, List } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUrlState } from "@/hooks/use-url-state";

type Mode = "board" | "grid" | "list";

const META: Record<Mode, { label: string; icon: typeof List }> = {
  board: { label: "Board", icon: Columns3 },
  grid: { label: "Cards", icon: LayoutGrid },
  list: { label: "List", icon: List },
};

/**
 * View switch stored in the URL as ?view=. The first mode is the default and
 * is represented by an absent parameter. Switching clears stage/page filters
 * that only make sense in one of the views.
 */
export function ViewSwitch({ modes, clear = ["page"] }: { modes: [Mode, Mode]; clear?: string[] }) {
  const url = useUrlState();
  const current = (url.get("view") as Mode) || modes[0];
  const value = modes.includes(current) ? current : modes[0];
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={value}
      onValueChange={(v) => {
        if (!v) return;
        url.set({ view: v === modes[0] ? null : v, ...Object.fromEntries(clear.map((k) => [k, null])) });
      }}
      aria-label="View"
    >
      {modes.map((m) => {
        const Icon = META[m].icon;
        return (
          <ToggleGroupItem key={m} value={m} aria-label={`${META[m].label} view`}>
            <Icon />
            <span className="hidden sm:inline">{META[m].label}</span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

/** Two-state filter chip stored in the URL (e.g. ?mine=1). */
export function UrlFlagToggle({ name, labels }: { name: string; labels: [string, string] }) {
  const url = useUrlState();
  const on = url.get(name) === "1";
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={on ? "on" : "off"}
      onValueChange={(v) => v && url.set({ [name]: v === "on" ? "1" : null })}
      aria-label={labels[1]}
    >
      <ToggleGroupItem value="off">{labels[0]}</ToggleGroupItem>
      <ToggleGroupItem value="on">{labels[1]}</ToggleGroupItem>
    </ToggleGroup>
  );
}
