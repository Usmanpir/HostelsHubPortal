"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/operations/filter-bar";
import { optionsFrom } from "@/config/labels";
import { listingPropertyTypeLabels, listingPurposeLabels, listingStatusLabels } from "@/config/real-estate-labels";
import { useUrlState } from "@/hooks/use-url-state";
import { ViewSwitch } from "./view-switch";

/** Debounced text input bound to one URL search param. */
function UrlInput({ name, placeholder, type = "text", className }: { name: string; placeholder: string; type?: "text" | "number"; className?: string }) {
  const url = useUrlState();
  const [value, setValue] = useState(url.get(name));
  const external = url.get(name);
  const [synced, setSynced] = useState(external);
  if (synced !== external) {
    // The URL changed elsewhere (e.g. Reset) — adopt it.
    setSynced(external);
    setValue(external);
  }
  useEffect(() => {
    if (value === url.get(name)) return;
    const t = setTimeout(() => url.set({ [name]: value.trim() || null }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      type={type}
      min={type === "number" ? 0 : undefined}
      inputMode={type === "number" ? "numeric" : undefined}
      className={className ?? "h-8 w-28"}
    />
  );
}

export function ListingFilters({ currency }: { currency: string }) {
  return (
    <FilterBar
      searchPlaceholder="Search title, code, area or city"
      filters={[
        { key: "purpose", label: "Purpose", options: optionsFrom(listingPurposeLabels) },
        { key: "status", label: "Status", options: optionsFrom(listingStatusLabels) },
        { key: "propertyType", label: "Type", options: optionsFrom(listingPropertyTypeLabels) },
      ]}
      extraKeys={["city", "minPrice", "maxPrice"]}
      trailing={<ViewSwitch modes={["grid", "list"]} />}
    >
      <UrlInput name="city" placeholder="City" />
      <div className="flex items-center gap-1">
        <UrlInput name="minPrice" placeholder={`Min ${currency}`} type="number" />
        <span className="text-muted-foreground">–</span>
        <UrlInput name="maxPrice" placeholder={`Max ${currency}`} type="number" />
      </div>
    </FilterBar>
  );
}

/** Simple previous / next pager for card views. */
export function Pager({ page, pageCount, total }: { page: number; pageCount: number; total: number }) {
  const url = useUrlState();
  if (pageCount <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <span className="tabular">{total} results</span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => url.set({ page: page - 1 > 1 ? page - 1 : null }, { resetPage: false })}
          aria-label="Previous page"
        >
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
