"use client";

import { useId, useMemo, useState } from "react";
import { Building2, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type HostelOption = { id: string; name: string; code: string; city?: string | null };
export type HostelAccessValue = { allHostels: boolean; hostelIds: string[] };

/** "All hostels" toggle, or a searchable checklist of specific hostels. */
export function HostelAccessPicker({
  hostels,
  value,
  onChange,
  error,
  disabled,
}: {
  hostels: HostelOption[];
  value: HostelAccessValue;
  onChange: (value: HostelAccessValue) => void;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value.hostelIds), [value.hostelIds]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return hostels;
    return hostels.filter((h) => `${h.name} ${h.code} ${h.city ?? ""}`.toLowerCase().includes(q));
  }, [hostels, query]);

  const toggle = (hostelId: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(hostelId);
    else next.delete(hostelId);
    onChange({ allHostels: false, hostelIds: [...next] });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-0">
          <label htmlFor={`${id}-all`} className="text-sm font-medium">
            Access to all hostels
          </label>
          <p className="text-sm text-muted-foreground">Includes hostels added in the future.</p>
        </div>
        <Switch
          id={`${id}-all`}
          checked={value.allHostels}
          disabled={disabled}
          onCheckedChange={(on) => onChange({ allHostels: on, hostelIds: value.hostelIds })}
        />
      </div>

      {!value.allHostels ? (
        hostels.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            No hostels yet — grant access to all hostels so they can see new ones as you add them.
          </p>
        ) : (
          <div className={cn("flex flex-col gap-2 rounded-lg border p-3", error && "border-destructive")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">
                Hostels <span className="font-normal text-muted-foreground tabular">({selected.size} selected)</span>
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded px-1.5 text-xs text-primary hover:underline disabled:opacity-50"
                  disabled={disabled}
                  onClick={() => onChange({ allHostels: false, hostelIds: hostels.map((h) => h.id) })}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="rounded px-1.5 text-xs text-primary hover:underline disabled:opacity-50"
                  disabled={disabled}
                  onClick={() => onChange({ allHostels: false, hostelIds: [] })}
                >
                  Clear
                </button>
              </div>
            </div>
            {hostels.length > 6 ? (
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search hostels…"
                  className="ps-8"
                  aria-label="Search hostels"
                />
              </div>
            ) : null}
            <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
              {filtered.map((h) => {
                const cid = `${id}-${h.id}`;
                return (
                  <li key={h.id}>
                    <label
                      htmlFor={cid}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                    >
                      <Checkbox
                        id={cid}
                        checked={selected.has(h.id)}
                        disabled={disabled}
                        onCheckedChange={(v) => toggle(h.id, v === true)}
                      />
                      <Building2 className="size-3.5 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{h.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{h.code}</span>
                    </label>
                  </li>
                );
              })}
              {filtered.length === 0 ? (
                <li className="px-2 py-3 text-center text-sm text-muted-foreground">No hostels match “{query}”.</li>
              ) : null}
            </ul>
          </div>
        )
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
