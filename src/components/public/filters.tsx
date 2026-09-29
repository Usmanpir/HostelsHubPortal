import Link from "next/link";
import { Search, X } from "lucide-react";
import type { ListingPropertyType } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import type { PublicListingFilters } from "@/lib/validation/public";
import { cn } from "@/lib/utils";
import { PROPERTY_TYPE_LABEL } from "./format";

const control =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
      {children}
    </label>
  );
}

/**
 * Plain GET form: works without JavaScript, keeps every filter in the URL
 * (shareable, crawlable) and resets to page 1 on submit.
 */
export function ListingFilters({
  basePath,
  filters,
  propertyTypes,
  locations,
}: {
  basePath: string;
  filters: PublicListingFilters;
  propertyTypes: ListingPropertyType[];
  locations: string[];
}) {
  const active =
    !!filters.purpose ||
    !!filters.type ||
    !!filters.location ||
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined ||
    filters.beds !== undefined ||
    filters.sort !== "newest";

  return (
    <form
      method="get"
      action={basePath}
      role="search"
      aria-label="Filter properties"
      className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-4 shadow-xs sm:grid-cols-3 lg:grid-cols-8"
    >
      <div className="flex flex-col gap-1.5 lg:col-span-1">
        <FieldLabel htmlFor="f-purpose">Purpose</FieldLabel>
        <select id="f-purpose" name="purpose" defaultValue={filters.purpose ?? ""} className={control}>
          <option value="">Any</option>
          <option value="SALE">For sale</option>
          <option value="RENT">For rent</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5 lg:col-span-1">
        <FieldLabel htmlFor="f-type">Type</FieldLabel>
        <select id="f-type" name="type" defaultValue={filters.type ?? ""} className={control}>
          <option value="">Any</option>
          {(propertyTypes.length ? propertyTypes : (Object.keys(PROPERTY_TYPE_LABEL) as ListingPropertyType[])).map((t) => (
            <option key={t} value={t}>
              {PROPERTY_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1 lg:col-span-2">
        <FieldLabel htmlFor="f-location">City or area</FieldLabel>
        <input
          id="f-location"
          name="location"
          type="search"
          list="f-location-options"
          defaultValue={filters.location ?? ""}
          placeholder="Anywhere"
          maxLength={80}
          autoComplete="off"
          className={control}
        />
        <datalist id="f-location-options">
          {locations.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="f-min">Min price</FieldLabel>
        <input
          id="f-min"
          name="minPrice"
          type="number"
          inputMode="numeric"
          min={0}
          step="any"
          defaultValue={filters.minPrice ?? ""}
          placeholder="No min"
          className={control}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="f-max">Max price</FieldLabel>
        <input
          id="f-max"
          name="maxPrice"
          type="number"
          inputMode="numeric"
          min={0}
          step="any"
          defaultValue={filters.maxPrice ?? ""}
          placeholder="No max"
          className={control}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="f-beds">Bedrooms</FieldLabel>
        <select id="f-beds" name="beds" defaultValue={filters.beds ? String(filters.beds) : ""} className={control}>
          <option value="">Any</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}+
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="f-sort">Sort by</FieldLabel>
        <select id="f-sort" name="sort" defaultValue={filters.sort} className={control}>
          <option value="newest">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </select>
      </div>
      <div className={cn("col-span-2 flex items-center gap-2 sm:col-span-3 lg:col-span-8 lg:justify-end")}>
        {active ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={basePath}>
              <X />
              Clear filters
            </Link>
          </Button>
        ) : null}
        <Button type="submit" size="sm" className="ms-auto lg:ms-0">
          <Search />
          Show results
        </Button>
      </div>
    </form>
  );
}
