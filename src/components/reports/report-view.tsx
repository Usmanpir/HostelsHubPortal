"use client";

import { Info } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { cn } from "@/lib/utils";
import type { ReportMeta } from "@/services/reports/registry";
import { presetLabel } from "@/services/reports/range";
import type { ReportResult } from "@/services/reports/types";
import { ReportChartCard } from "./report-chart";
import { ReportFilters } from "./report-filters";
import { BreakdownCard, ReportDetailTable } from "./report-table";
import { useValueFormat } from "./use-value-format";

export function ReportView({
  meta,
  result,
  hostels,
  defaultHostelLabel,
  organizationName,
  generatedAt,
}: {
  meta: ReportMeta;
  result: ReportResult;
  hostels: { id: string; name: string }[];
  defaultHostelLabel: string;
  organizationName: string;
  generatedAt: string;
}) {
  const fmt = useValueFormat();
  const f = result.filters;
  const hostelName = f.hostelId ? (hostels.find((h) => h.id === f.hostelId)?.name ?? "Selected hostel") : defaultHostelLabel;
  const period = meta.usesDateRange
    ? `${f.preset === "custom" ? "" : `${presetLabel(f.preset)} · `}${fmt.value("date", f.from)} – ${fmt.value("date", f.to)}`
    : "Current snapshot";
  const statusLabel = f.status ? meta.statusFilter?.options.find((o) => o.value === f.status)?.label : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Print header */}
      <div className="hidden border-b pb-3 print:block">
        <div className="text-xs text-muted-foreground">{organizationName}</div>
        <div className="text-xl font-semibold">{meta.title} report</div>
        <div className="mt-1 text-sm">
          {period} · {hostelName}
          {statusLabel ? ` · ${statusLabel}` : ""}
        </div>
        <div className="text-xs text-muted-foreground">Generated {fmt.value("datetime", generatedAt)}</div>
      </div>

      <ReportFilters
        usesDateRange={meta.usesDateRange}
        dateLabel={meta.dateLabel}
        from={f.from}
        to={f.to}
        preset={f.preset}
        hostelId={f.hostelId}
        status={f.status}
        hostels={hostels}
        defaultHostelLabel={defaultHostelLabel}
        statusFilter={meta.statusFilter}
      />

      {result.stats.length ? (
        <div
          className={cn(
            "grid grid-cols-2 gap-3 md:grid-cols-3",
            result.stats.length >= 6 ? "xl:grid-cols-6" : result.stats.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4",
          )}
        >
          {result.stats.map((s) => (
            <StatCard key={s.label} label={s.label} value={fmt.value(s.format, s.value)} hint={s.hint} className="break-inside-avoid" />
          ))}
        </div>
      ) : null}

      {result.note ? (
        <p className="-mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          {result.note}
        </p>
      ) : null}

      {result.charts.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {result.charts.map((c) => (
            <ReportChartCard key={c.id} chart={c} className={cn(c.span !== "half" && "lg:col-span-2", "break-inside-avoid")} />
          ))}
        </div>
      ) : null}

      {result.breakdowns.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {result.breakdowns.map((b) => (
            <BreakdownCard key={b.id} breakdown={b} />
          ))}
        </div>
      ) : null}

      <ReportDetailTable reportKey={meta.key} table={result.table} />
    </div>
  );
}
