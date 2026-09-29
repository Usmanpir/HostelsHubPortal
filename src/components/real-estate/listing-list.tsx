"use client";

import Link from "next/link";
import { Bath, BedDouble, Camera, Globe, Home, MapPin, Ruler } from "lucide-react";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { useFormatters, useOrg } from "@/components/shared/org-context";
import {
  formatArea,
  formatPriceShort,
  listingPropertyTypeLabels,
  listingPurposeLabels,
  listingPurposeTones,
  listingStatusLabels,
  listingStatusTones,
} from "@/config/real-estate-labels";
import type { AreaUnit, ListingPropertyType, ListingPurpose, ListingStatus } from "@/generated/prisma/enums";
import type { Paginated } from "@/lib/validation/common";
import { cn } from "@/lib/utils";

export type ListingRow = {
  id: string;
  code: string;
  title: string;
  purpose: ListingPurpose;
  propertyType: ListingPropertyType;
  status: ListingStatus;
  price: number;
  priceNegotiable: boolean;
  areaValue: number | null;
  areaUnit: AreaUnit | null;
  bedrooms: number | null;
  bathrooms: number | null;
  locality: string | null;
  city: string | null;
  coverFileId: string | null;
  isPublished: boolean;
  agent: { id: string; name: string } | null;
  _count: { photos: number; leads: number };
};

function place(l: { locality: string | null; city: string | null }) {
  return [l.locality, l.city].filter(Boolean).join(", ");
}

export function ListingCover({ fileId, title, className }: { fileId: string | null; title: string; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {fileId ? (
        // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file route
        <img src={`/api/files/${fileId}`} alt={title} loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <Home className="size-8 opacity-40" />
        </div>
      )}
    </div>
  );
}

function Facts({ l }: { l: ListingRow }) {
  const area = formatArea(l.areaValue, l.areaUnit);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {area ? (
        <span className="inline-flex items-center gap-1">
          <Ruler className="size-3" />
          {area}
        </span>
      ) : null}
      {l.bedrooms != null ? (
        <span className="inline-flex items-center gap-1">
          <BedDouble className="size-3" />
          {l.bedrooms} bed
        </span>
      ) : null}
      {l.bathrooms != null ? (
        <span className="inline-flex items-center gap-1">
          <Bath className="size-3" />
          {l.bathrooms} bath
        </span>
      ) : null}
      {l._count.photos ? (
        <span className="inline-flex items-center gap-1">
          <Camera className="size-3" />
          {l._count.photos}
        </span>
      ) : null}
    </div>
  );
}

/** Card grid with cover photos. */
export function ListingGrid({ rows }: { rows: ListingRow[] }) {
  const { currency, locale } = useOrg();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((l) => (
        <Link
          key={l.id}
          href={`/listings/${l.id}`}
          className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/30"
        >
          <div className="relative">
            <ListingCover fileId={l.coverFileId} title={l.title} className="aspect-16/10" />
            <div className="absolute start-2 top-2 flex flex-wrap gap-1">
              <EnumBadge value={l.purpose} labels={listingPurposeLabels} tones={listingPurposeTones} />
              {l.isPublished ? (
                <StatusBadge tone="success" dot={false}>
                  <Globe className="size-3" />
                  Public
                </StatusBadge>
              ) : null}
            </div>
            <div className="absolute end-2 top-2">
              <EnumBadge value={l.status} labels={listingStatusLabels} tones={listingStatusTones} />
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="tabular text-lg font-semibold">
                {formatPriceShort(l.price, currency, locale)}
                {l.purpose === "RENT" ? <span className="text-xs font-normal text-muted-foreground"> /month</span> : null}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{l.code}</span>
            </div>
            <h3 className="line-clamp-2 text-sm font-medium group-hover:text-primary">{l.title}</h3>
            {place(l) ? (
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <MapPin className="size-3 shrink-0" />
                {place(l)}
              </p>
            ) : null}
            <Facts l={l} />
            <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
              <span>{listingPropertyTypeLabels[l.propertyType]}</span>
              <span className="truncate">{l.agent ? l.agent.name : "No agent"} · {l._count.leads} lead{l._count.leads === 1 ? "" : "s"}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Table view (DataTable with mobile cards). */
export function ListingTable({
  data,
  filters,
  toolbar,
  empty,
}: {
  data: Paginated<ListingRow>;
  filters: FilterDef[];
  toolbar?: React.ReactNode;
  empty: React.ReactNode;
}) {
  const fmt = useFormatters();
  const columns: Column<ListingRow>[] = [
    {
      id: "listing",
      header: "Listing",
      hideable: false,
      sortKey: "title",
      cell: (l) => (
        <Link href={`/listings/${l.id}`} className="flex min-w-0 items-center gap-3 hover:text-primary">
          <ListingCover fileId={l.coverFileId} title={l.title} className="size-10 shrink-0 rounded-md" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{l.title}</span>
            <span className="font-mono text-xs text-muted-foreground">{l.code}</span>
          </span>
        </Link>
      ),
    },
    { id: "purpose", header: "Purpose", cell: (l) => <EnumBadge value={l.purpose} labels={listingPurposeLabels} tones={listingPurposeTones} /> },
    { id: "type", header: "Type", cell: (l) => listingPropertyTypeLabels[l.propertyType] },
    { id: "price", header: "Price", sortKey: "price", align: "end", cell: (l) => fmt.money(l.price) },
    { id: "area", header: "Area", cell: (l) => formatArea(l.areaValue, l.areaUnit) ?? <span className="text-muted-foreground">—</span> },
    { id: "location", header: "Location", cell: (l) => place(l) || <span className="text-muted-foreground">—</span> },
    { id: "agent", header: "Agent", defaultHidden: true, cell: (l) => l.agent?.name ?? <span className="text-muted-foreground">Unassigned</span> },
    { id: "leads", header: "Leads", align: "end", cell: (l) => l._count.leads },
    {
      id: "status",
      header: "Status",
      sortKey: "status",
      cell: (l) => (
        <span className="inline-flex items-center gap-1.5">
          <EnumBadge value={l.status} labels={listingStatusLabels} tones={listingStatusTones} />
          {l.isPublished ? <Globe className="size-3.5 text-success" aria-label="Published" /> : null}
        </span>
      ),
    },
  ];
  return (
    <DataTable
      rows={data.items}
      columns={columns}
      getRowId={(l) => l.id}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      pageSize={data.pageSize}
      rowHref={(l) => `/listings/${l.id}`}
      hideSearch
      filters={filters}
      storageKey="listings"
      toolbar={toolbar}
      empty={empty}
      mobileCard={(l) => (
        <div className="flex gap-3">
          <ListingCover fileId={l.coverFileId} title={l.title} className="size-16 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 text-sm font-medium">{l.title}</p>
              <EnumBadge value={l.status} labels={listingStatusLabels} tones={listingStatusTones} />
            </div>
            <p className="tabular text-sm font-semibold">{fmt.money(l.price)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {listingPurposeLabels[l.purpose]} · {listingPropertyTypeLabels[l.propertyType]}
              {place(l) ? ` · ${place(l)}` : ""}
            </p>
          </div>
        </div>
      )}
    />
  );
}

export function ListingEmpty({ filtered, action }: { filtered: boolean; action?: React.ReactNode }) {
  return (
    <EmptyState
      icon={Home}
      title={filtered ? "No listings match your filters" : "No listings yet"}
      description="Add properties you are selling or renting out, with photos, price and features."
      action={action}
    />
  );
}
