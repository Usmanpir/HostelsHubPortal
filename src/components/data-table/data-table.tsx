"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlState } from "@/hooks/use-url-state";
import { cn } from "@/lib/utils";

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Server-side sort key; enables a sortable header */
  sortKey?: string;
  className?: string;
  headerClassName?: string;
  align?: "start" | "end";
  /** Can be toggled in the column menu (default true) */
  hideable?: boolean;
  defaultHidden?: boolean;
  /** Hide from the auto-generated mobile card */
  hideOnMobile?: boolean;
};

export type FilterDef = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
};

export type BulkAction = {
  label: string;
  icon?: React.ReactNode;
  variant?: "default" | "outline" | "destructive";
  onRun: (ids: string[]) => Promise<void> | void;
};

export type DataTableProps<T> = {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  filters?: FilterDef[];
  toolbar?: React.ReactNode;
  bulkActions?: BulkAction[];
  mobileCard?: (row: T) => React.ReactNode;
  empty?: React.ReactNode;
  /** localStorage key for remembering hidden columns */
  storageKey?: string;
  hideSearch?: boolean;
};

const ALL = "__all__";

export function DataTable<T>(props: DataTableProps<T>) {
  const { rows, columns, getRowId, total, page, pageCount, pageSize, rowHref, onRowClick } = props;
  const router = useRouter();
  const url = useUrlState();
  const [search, setSearch] = useState(url.get("q"));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.id)),
  );

  // Restore remembered column visibility.
  useEffect(() => {
    if (!props.storageKey) return;
    try {
      const saved = window.localStorage.getItem(`table-columns:${props.storageKey}`);
      if (saved) setHidden(new Set(JSON.parse(saved) as string[]));
    } catch {
      /* storage unavailable */
    }
  }, [props.storageKey]);

  const toggleColumn = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (props.storageKey) {
        try {
          window.localStorage.setItem(`table-columns:${props.storageKey}`, JSON.stringify([...next]));
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  // Debounced search → URL
  useEffect(() => {
    const current = url.get("q");
    if (search === current) return;
    const t = setTimeout(() => url.set({ q: search.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Clear selection when the page of rows changes.
  const rowKey = rows.map(getRowId).join(",");
  useEffect(() => setSelected(new Set()), [rowKey]);

  const visible = useMemo(() => columns.filter((c) => !hidden.has(c.id)), [columns, hidden]);
  const sort = url.get("sort");
  const dir = url.get("dir") === "asc" ? "asc" : "desc";
  const hasFilters = !!url.get("q") || (props.filters ?? []).some((f) => url.get(f.key));
  const bulk = props.bulkActions?.length ? props.bulkActions : null;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(getRowId(r)));

  const onSort = (key: string) => {
    if (sort !== key) url.set({ sort: key, dir: "asc" });
    else if (dir === "asc") url.set({ sort: key, dir: "desc" });
    else url.set({ sort: null, dir: null });
  };

  const go = (row: T) => {
    if (onRowClick) return onRowClick(row);
    const href = rowHref?.(row);
    if (href) router.push(href);
  };

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {!props.hideSearch ? (
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={props.searchPlaceholder ?? "Search…"}
              className="ps-8"
              aria-label="Search"
            />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {(props.filters ?? []).map((f) => (
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
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                url.set(Object.fromEntries([["q", null], ...(props.filters ?? []).map((f) => [f.key, null])]));
              }}
            >
              <X />
              Reset
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2 sm:ms-auto">
          {props.toolbar}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="hidden md:inline-flex">
                <Columns3 />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns
                .filter((c) => c.hideable !== false)
                .map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={!hidden.has(c.id)}
                    onCheckedChange={() => toggleColumn(c.id)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {c.header}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {bulk && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-accent/40 px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <div className="flex flex-wrap gap-2 sm:ms-auto">
            {bulk.map((a) => (
              <Button
                key={a.label}
                size="sm"
                variant={a.variant ?? "outline"}
                onClick={async () => {
                  await a.onRun([...selected]);
                  setSelected(new Set());
                }}
              >
                {a.icon}
                {a.label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <div className={cn("transition-opacity", url.pending && "pointer-events-none opacity-60")}>
        {rows.length === 0 ? (
          (props.empty ?? (
            <div className="rounded-xl border border-dashed bg-card py-12 text-center text-sm text-muted-foreground">
              {hasFilters ? "No results match your filters." : "Nothing here yet."}
            </div>
          ))
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    {bulk ? (
                      <TableHead className="w-10">
                        <Checkbox
                          aria-label="Select all"
                          checked={allSelected}
                          onCheckedChange={(v) => setSelected(v ? new Set(rows.map(getRowId)) : new Set())}
                        />
                      </TableHead>
                    ) : null}
                    {visible.map((c) => (
                      <TableHead key={c.id} className={cn(c.align === "end" && "text-end", c.headerClassName)}>
                        {c.sortKey ? (
                          <button
                            type="button"
                            onClick={() => onSort(c.sortKey!)}
                            className={cn("inline-flex items-center gap-1 hover:text-foreground", c.align === "end" && "flex-row-reverse")}
                          >
                            {c.header}
                            {sort === c.sortKey ? (
                              dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                            ) : (
                              <ArrowUpDown className="size-3.5 opacity-40" />
                            )}
                          </button>
                        ) : (
                          c.header
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const id = getRowId(row);
                    const clickable = !!(onRowClick || rowHref?.(row));
                    return (
                      <TableRow
                        key={id}
                        data-state={selected.has(id) ? "selected" : undefined}
                        className={cn(clickable && "cursor-pointer")}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("a,button,[role=checkbox],[role=menuitem],input")) return;
                          if (clickable) go(row);
                        }}
                      >
                        {bulk ? (
                          <TableCell className="w-10">
                            <Checkbox
                              aria-label="Select row"
                              checked={selected.has(id)}
                              onCheckedChange={(v) =>
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  if (v) next.add(id);
                                  else next.delete(id);
                                  return next;
                                })
                              }
                            />
                          </TableCell>
                        ) : null}
                        {visible.map((c) => (
                          <TableCell key={c.id} className={cn(c.align === "end" && "text-end tabular", c.className)}>
                            {c.cell(row)}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="flex flex-col gap-2 md:hidden">
              {rows.map((row) => {
                const id = getRowId(row);
                const href = rowHref?.(row);
                const content = props.mobileCard ? (
                  props.mobileCard(row)
                ) : (
                  <AutoCard row={row} columns={visible.filter((c) => !c.hideOnMobile)} />
                );
                return href && !onRowClick ? (
                  <Link key={id} href={href} className="block rounded-xl border bg-card p-3 active:bg-accent/50">
                    {content}
                  </Link>
                ) : (
                  <div
                    key={id}
                    className={cn("rounded-xl border bg-card p-3", onRowClick && "cursor-pointer active:bg-accent/50")}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {total > 0 ? (
        <div className="flex flex-col items-center justify-between gap-2 text-sm text-muted-foreground sm:flex-row">
          <span className="tabular">
            Showing {from}–{to} of {total}
          </span>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(v) => url.set({ pageSize: v === "20" ? null : v })}>
              <SelectTrigger size="sm" className="w-24" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page >= pageCount}
              onClick={() => url.set({ page: page + 1 }, { resetPage: false })}
              aria-label="Next page"
            >
              <ChevronRight className="rtl:rotate-180" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AutoCard<T>({ row, columns }: { row: T; columns: Column<T>[] }) {
  const [first, ...rest] = columns;
  return (
    <div className="flex flex-col gap-2">
      {first ? <div className="font-medium">{first.cell(row)}</div> : null}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
        {rest.map((c) => (
          <div key={c.id} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{c.header}</dt>
            <dd className="truncate">{c.cell(row)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
