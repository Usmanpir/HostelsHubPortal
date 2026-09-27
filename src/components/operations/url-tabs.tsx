"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlState } from "@/hooks/use-url-state";

/** Tabs bound to a URL search param (first tab = param absent). */
export function UrlTabs({ param, tabs }: { param: string; tabs: { value: string; label: React.ReactNode }[] }) {
  const url = useUrlState();
  const first = tabs[0]?.value ?? "";
  const value = url.get(param) || first;
  return (
    <Tabs value={value} onValueChange={(v) => url.set({ [param]: v === first ? null : v })} className="mb-3">
      <TabsList className="max-w-full overflow-x-auto">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** Previous / next pager for card lists. */
export function SimplePager({ page, pageCount, total }: { page: number; pageCount: number; total: number }) {
  const url = useUrlState();
  if (pageCount <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <span className="tabular">{total} total</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => url.set({ page: page - 1 > 1 ? page - 1 : null }, { resetPage: false })} aria-label="Previous page">
          <ChevronLeft className="rtl:rotate-180" />
        </Button>
        <span className="tabular min-w-16 text-center">
          {page} / {pageCount}
        </span>
        <Button variant="outline" size="icon-sm" disabled={page >= pageCount} onClick={() => url.set({ page: page + 1 }, { resetPage: false })} aria-label="Next page">
          <ChevronRight className="rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}
