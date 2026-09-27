"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FilterDef } from "@/components/data-table/data-table";
import { useUrlState } from "@/hooks/use-url-state";

const ALL = "__all__";

/**
 * URL-driven search + select filters for views that don't use DataTable
 * (board, announcement cards, visitor log date range).
 */
export function FilterBar({
  filters = [],
  searchPlaceholder = "Search…",
  children,
  trailing,
  extraKeys = [],
}: {
  filters?: FilterDef[];
  searchPlaceholder?: string;
  /** Extra inline controls (e.g. date inputs) */
  children?: React.ReactNode;
  /** Right-aligned controls (e.g. export) */
  trailing?: React.ReactNode;
  /** Additional URL keys cleared by Reset */
  extraKeys?: string[];
}) {
  const url = useUrlState();
  const [q, setQ] = useState(url.get("q"));
  useEffect(() => {
    if (q === url.get("q")) return;
    const t = setTimeout(() => url.set({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const active = !!url.get("q") || filters.some((f) => url.get(f.key)) || extraKeys.some((k) => url.get(k));

  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="ps-8" aria-label="Search" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <Select key={f.key} value={url.get(f.key) || ALL} onValueChange={(v) => url.set({ [f.key]: v === ALL ? null : v })}>
            <SelectTrigger size="sm" className="min-w-32" aria-label={f.label}>
              <SelectValue placeholder={f.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All {f.label.toLowerCase()}</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {children}
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              url.set(Object.fromEntries([["q", null], ...filters.map((f) => [f.key, null]), ...extraKeys.map((k) => [k, null])]));
            }}
          >
            <X />
            Reset
          </Button>
        ) : null}
      </div>
      {trailing ? <div className="flex items-center gap-2 sm:ms-auto">{trailing}</div> : null}
    </div>
  );
}
