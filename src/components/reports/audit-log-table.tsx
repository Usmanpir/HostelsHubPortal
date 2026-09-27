"use client";

import { useMemo, useState } from "react";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { ExportMenu } from "@/components/data-table/export-menu";
import { useFormatters } from "@/components/shared/org-context";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useUrlState } from "@/hooks/use-url-state";
import type { Tone } from "@/config/labels";
import { cn } from "@/lib/utils";
import type { Paginated } from "@/lib/validation/common";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Json | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date | string;
  user: { id: string; name: string; email: string } | null;
};

export function humanizeAction(action: string) {
  const s = action.replace(/[._]/g, " ").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function actionTone(action: string): Tone {
  const verb = action.split(".").slice(1).join(".");
  if (/(void|cancel|archiv|delet|remov|revok|reject|disabl|fail)/.test(verb)) return "danger";
  if (/(creat|add|join|issu|approv|restor)/.test(verb)) return "success";
  if (/(login|logout)/.test(action)) return "neutral";
  return "info";
}

const isObject = (v: unknown): v is Record<string, Json> => typeof v === "object" && v !== null && !Array.isArray(v);

function display(v: Json | undefined): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "string") return v === "" ? '""' : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function DateFilters() {
  const url = useUrlState();
  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="date"
        aria-label="From date"
        className="h-8 w-36"
        value={url.get("from")}
        max={url.get("to") || undefined}
        onChange={(e) => url.set({ from: e.target.value || null })}
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        aria-label="To date"
        className="h-8 w-36"
        value={url.get("to")}
        min={url.get("from") || undefined}
        onChange={(e) => url.set({ to: e.target.value || null })}
      />
    </div>
  );
}

function DiffTable({ before, after }: { before: Record<string, Json>; after: Record<string, Json> }) {
  const [onlyChanges, setOnlyChanges] = useState(true);
  const rows = useMemo(() => {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.map((k) => ({ key: k, before: before[k], after: after[k], changed: JSON.stringify(before[k]) !== JSON.stringify(after[k]) }));
  }, [before, after]);
  const shown = onlyChanges ? rows.filter((r) => r.changed) : rows;
  const hasBoth = Object.keys(before).length > 0 && Object.keys(after).length > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Changes</h3>
        {hasBoth ? (
          <div className="flex items-center gap-2">
            <Switch id="only-changes" checked={onlyChanges} onCheckedChange={setOnlyChanges} />
            <Label htmlFor="only-changes" className="text-xs text-muted-foreground">
              Only changed fields
            </Label>
          </div>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full table-fixed text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="w-1/4 px-2.5 py-2 text-start font-medium">Field</th>
              <th className="px-2.5 py-2 text-start font-medium">Before</th>
              <th className="px-2.5 py-2 text-start font-medium">After</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-2.5 py-4 text-center text-muted-foreground">
                  No field changes recorded.
                </td>
              </tr>
            ) : (
              shown.map((r) => (
                <tr key={r.key} className={cn("border-t align-top", r.changed && hasBoth && "bg-warning-soft/40")}>
                  <td className="px-2.5 py-1.5 font-mono break-all text-muted-foreground">{r.key}</td>
                  <td className={cn("px-2.5 py-1.5 font-mono break-all", r.changed && hasBoth && "text-danger line-through decoration-danger/40")}>
                    {display(r.before)}
                  </td>
                  <td className={cn("px-2.5 py-1.5 font-mono break-all", r.changed && hasBoth && "text-success")}>{display(r.after)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditDetails({ row }: { row: AuditRow }) {
  const fmt = useFormatters();
  const meta = isObject(row.metadata) ? row.metadata : null;
  const before = meta && isObject(meta.before) ? meta.before : null;
  const after = meta && isObject(meta.after) ? meta.after : null;
  const extra = meta ? Object.entries(meta).filter(([k]) => k !== "before" && k !== "after") : [];
  const facts: [string, string][] = [
    ["Time", fmt.dateTime(row.createdAt)],
    ["User", row.user ? `${row.user.name} (${row.user.email})` : "System"],
    ["Action", row.action],
    ["Entity", row.entityType],
    ["Entity ID", row.entityId ?? "—"],
    ["IP address", row.ipAddress ?? "—"],
    ["User agent", row.userAgent ?? "—"],
  ];
  return (
    <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-6">
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className={cn("min-w-0 break-all", (k === "Action" || k === "Entity ID") && "font-mono text-xs leading-5")}>{v}</dd>
          </div>
        ))}
      </dl>

      {before || after ? <DiffTable before={before ?? {}} after={after ?? {}} /> : null}

      {extra.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Details</h3>
          <dl className="overflow-hidden rounded-lg border text-xs">
            {extra.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 border-t px-2.5 py-1.5 first:border-t-0">
                <dt className="font-mono break-all text-muted-foreground">{k}</dt>
                <dd className="font-mono break-all">{display(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {!meta && row.metadata !== null ? (
        <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs">{JSON.stringify(row.metadata, null, 2)}</pre>
      ) : null}
      {row.metadata === null ? <p className="text-sm text-muted-foreground">No additional details were recorded for this event.</p> : null}
    </div>
  );
}

export function AuditLogTable({
  data,
  actionOptions,
  userOptions,
}: {
  data: Paginated<AuditRow>;
  actionOptions: { value: string; label: string }[];
  userOptions: { value: string; label: string }[];
}) {
  const fmt = useFormatters();
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const filters: FilterDef[] = [
    { key: "action", label: "Areas", options: actionOptions },
    { key: "userId", label: "Users", options: userOptions },
  ];
  const columns: Column<AuditRow>[] = [
    {
      id: "time",
      header: "Time",
      hideable: false,
      className: "whitespace-nowrap",
      cell: (r) => <span className="tabular text-sm">{fmt.dateTime(r.createdAt)}</span>,
    },
    {
      id: "user",
      header: "User",
      cell: (r) =>
        r.user ? (
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{r.user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{r.user.email}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">System</span>
        ),
    },
    {
      id: "action",
      header: "Action",
      cell: (r) => (
        <span className="flex flex-col items-start gap-0.5">
          <StatusBadge tone={actionTone(r.action)}>{humanizeAction(r.action)}</StatusBadge>
          <span className="font-mono text-[11px] text-muted-foreground">{r.action}</span>
        </span>
      ),
    },
    { id: "entity", header: "Entity", cell: (r) => r.entityType },
    {
      id: "entityId",
      header: "Entity ID",
      hideOnMobile: true,
      cell: (r) => (r.entityId ? <span className="font-mono text-xs">{r.entityId}</span> : <span className="text-muted-foreground">—</span>),
    },
    { id: "ip", header: "IP address", hideOnMobile: true, cell: (r) => <span className="font-mono text-xs">{r.ipAddress ?? "—"}</span> },
  ];

  return (
    <>
      <DataTable
        rows={data.items}
        columns={columns}
        getRowId={(r) => r.id}
        total={data.total}
        page={data.page}
        pageCount={data.pageCount}
        pageSize={data.pageSize}
        onRowClick={setSelected}
        searchPlaceholder="Search action, entity, user or IP"
        filters={filters}
        storageKey="audit-log"
        toolbar={
          <>
            <DateFilters />
            <ExportMenu endpoint="/api/audit-logs" />
          </>
        }
        empty={
          <div className="rounded-xl border border-dashed bg-card py-12 text-center text-sm text-muted-foreground">
            No audit events match these filters.
          </div>
        }
      />
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full gap-0 sm:max-w-xl">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{humanizeAction(selected.action)}</SheetTitle>
                <SheetDescription>
                  {selected.entityType}
                  {selected.entityId ? ` · ${selected.entityId}` : ""}
                </SheetDescription>
              </SheetHeader>
              <AuditDetails row={selected} />
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
