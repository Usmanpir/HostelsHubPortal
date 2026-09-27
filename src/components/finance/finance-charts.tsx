"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormatters, useOrg } from "@/components/shared/org-context";
import { paymentMethodLabels } from "@/config/labels";
import { formatCompactMoney } from "@/lib/format";
import type { FinanceDashboard } from "@/services/finance/finance-dashboard-service";
import { cn } from "@/lib/utils";

/**
 * Finance overview charts. Design rules (dataviz skill):
 *  - one y-axis per chart (all series share the currency unit)
 *  - categorical hues in fixed order: billed = chart-1, collected = chart-2,
 *    expenses = chart-3 — the same entity keeps the same colour everywhere
 *  - single-series charts reuse their entity hue (collections = chart-2, expenses = chart-3); no value-ramp on nominal categories
 *  - bars ≤ 24px with 4px rounded data ends, 2px lines, hairline solid grid
 *  - legend for ≥ 2 series, a table view for every chart, text never wears series colour
 */

const SERIES = {
  billed: { label: "Billed", color: "var(--chart-1)" },
  collected: { label: "Collected", color: "var(--chart-2)" },
  expenses: { label: "Expenses", color: "var(--chart-3)" },
} as const;

type SeriesKey = keyof typeof SERIES;

const axisTick = { fill: "var(--muted-foreground)", fontSize: 12 };

function useCompact() {
  const { currency, locale } = useOrg();
  return (n: number) => formatCompactMoney(n, currency, locale);
}

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  const fmt = useFormatters();
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {label !== undefined ? <p className="mb-1.5 font-medium">{label}</p> : null}
      <ul className="grid gap-1">
        {payload.map((entry) => (
          <li key={String(entry.dataKey ?? entry.name)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: entry.color }} aria-hidden />
              {entry.name}
            </span>
            <span className="tabular font-medium">{fmt.money(Number(entry.value) || 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legend({ keys }: { keys: SeriesKey[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {keys.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[k].color }} aria-hidden />
          {SERIES[k].label}
        </li>
      ))}
    </ul>
  );
}

/** Card with a Chart / Table switch so every value is readable without hover. */
function ChartCard({
  title,
  description,
  legend,
  table,
  empty,
  className,
  children,
}: {
  title: string;
  description?: string;
  legend?: React.ReactNode;
  table: React.ReactNode;
  empty?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={cn("flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {!empty ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setView((v) => (v === "chart" ? "table" : "chart"))}
            aria-label={view === "chart" ? `Show ${title} as a table` : `Show ${title} as a chart`}
            title={view === "chart" ? "Table view" : "Chart view"}
          >
            {view === "chart" ? <Table2 /> : <BarChart3 />}
          </Button>
        ) : null}
      </header>
      {empty ? (
        <div className="flex min-h-40 flex-1 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          No data for this period
        </div>
      ) : view === "table" ? (
        <div className="max-h-80 overflow-auto">{table}</div>
      ) : (
        <>
          {legend}
          {children}
        </>
      )}
    </section>
  );
}

function DataTableView({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-card">
        <tr className="border-b text-xs text-muted-foreground">
          {head.map((h, i) => (
            <th key={h} className={cn("py-1.5 font-medium", i === 0 ? "text-start" : "text-end")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b last:border-b-0">
            {r.map((cell, j) => (
              <td key={j} className={cn("py-1.5", j === 0 ? "text-start" : "tabular text-end")}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MonthlyTrendChart({ data }: { data: FinanceDashboard["monthly"] }) {
  const fmt = useFormatters();
  const compact = useCompact();
  const keys: SeriesKey[] = ["billed", "collected", "expenses"];
  const empty = data.every((d) => d.billed === 0 && d.collected === 0 && d.expenses === 0);
  return (
    <ChartCard
      title="Revenue, collections & expenses"
      description="Last 12 months"
      legend={<Legend keys={keys} />}
      empty={empty}
      className="lg:col-span-2"
      table={
        <DataTableView
          head={["Month", "Billed", "Collected", "Expenses"]}
          rows={data.map((d) => [d.label, fmt.money(d.billed), fmt.money(d.collected), fmt.money(d.expenses)])}
        />
      }
    >
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%" barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tickLine={false} axisLine={false} tick={axisTick} tickFormatter={compact} width={64} />
            <Tooltip content={ChartTooltip} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
            {keys.map((k) => (
              <Bar key={k} dataKey={k} name={SERIES[k].label} fill={SERIES[k].color} radius={[4, 4, 0, 0]} maxBarSize={24} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function CollectionTrendChart({ trend }: { trend: FinanceDashboard["trend"] }) {
  const fmt = useFormatters();
  const compact = useCompact();
  const empty = trend.points.every((p) => p.amount === 0);
  const unitLabel = trend.unit === "day" ? "Daily" : trend.unit === "week" ? "Weekly" : "Monthly";
  return (
    <ChartCard
      title="Collection trend"
      description={`${unitLabel} net cash collected in the selected range`}
      empty={empty}
      table={<DataTableView head={[trend.unit === "month" ? "Month" : trend.unit === "week" ? "Week of" : "Day", "Collected"]} rows={trend.points.map((p) => [p.label, fmt.money(p.amount)])} />}
    >
      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend.points} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} tick={axisTick} tickFormatter={compact} width={64} />
            <Tooltip content={ChartTooltip} cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="amount"
              name="Collected"
              stroke="var(--chart-2)"
              strokeWidth={2}
              fill="var(--chart-2)"
              fillOpacity={0.1}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function HostelRevenueChart({ data }: { data: FinanceDashboard["byHostel"] }) {
  const fmt = useFormatters();
  const compact = useCompact();
  const keys: SeriesKey[] = ["billed", "collected"];
  const rows = data.slice(0, 10);
  const height = Math.max(160, rows.length * 44 + 40);
  return (
    <ChartCard
      title="Revenue by hostel"
      description="Billed vs collected in the selected range"
      legend={<Legend keys={keys} />}
      empty={rows.length === 0}
      table={<DataTableView head={["Hostel", "Billed", "Collected"]} rows={data.map((h) => [h.name, fmt.money(h.billed), fmt.money(h.collected)])} />}
    >
      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%" barGap={2}>
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis type="number" tickLine={false} axisLine={false} tick={axisTick} tickFormatter={compact} />
            <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={axisTick} width={110} />
            <Tooltip content={ChartTooltip} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
            {keys.map((k) => (
              <Bar key={k} dataKey={k} name={SERIES[k].label} fill={SERIES[k].color} radius={[0, 4, 4, 0]} maxBarSize={16} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.length > rows.length ? <p className="text-xs text-muted-foreground">Top 10 of {data.length} hostels — see the table view for all.</p> : null}
    </ChartCard>
  );
}

/** Ranked horizontal bars rendered in HTML (single series, value labels at the bar end). */
function RankedBars({ items, color }: { items: { key: string; label: string; value: number; hint?: string }[]; color: string }) {
  const fmt = useFormatters();
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="grid gap-3">
      {items.map((i) => (
        <li key={i.key} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{i.label}</span>
            <span className="tabular shrink-0 font-medium">
              {fmt.money(i.value)}
              {i.hint ? <span className="ms-1.5 text-xs font-normal text-muted-foreground">{i.hint}</span> : null}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (i.value / max) * 100)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ExpensesByCategoryChart({ data }: { data: FinanceDashboard["expensesByCategory"] }) {
  const fmt = useFormatters();
  const top = data.slice(0, 7);
  const rest = data.slice(7);
  const items = [
    ...top.map((c) => ({ key: c.categoryId, label: c.name, value: c.total })),
    ...(rest.length ? [{ key: "__other__", label: `Other (${rest.length} categories)`, value: rest.reduce((s, c) => s + c.total, 0) }] : []),
  ];
  const total = data.reduce((s, c) => s + c.total, 0);
  return (
    <ChartCard
      title="Expenses by category"
      description="Recorded expenses in the selected range"
      empty={data.length === 0}
      table={
        <DataTableView
          head={["Category", "Expenses", "Amount", "Share"]}
          rows={data.map((c) => [c.name, c.count, fmt.money(c.total), total > 0 ? `${Math.round((c.total / total) * 100)}%` : "—"])}
        />
      }
    >
      <RankedBars color={SERIES.expenses.color} items={items.map((i) => ({ ...i, hint: total > 0 ? `${Math.round((i.value / total) * 100)}%` : undefined }))} />
    </ChartCard>
  );
}

export function PaymentMethodsChart({ data }: { data: FinanceDashboard["paymentMethods"] }) {
  const fmt = useFormatters();
  return (
    <ChartCard
      title="Payment methods"
      description="How residents paid in the selected range"
      empty={data.length === 0}
      table={
        <DataTableView
          head={["Method", "Payments", "Amount", "Share"]}
          rows={data.map((m) => [paymentMethodLabels[m.method], m.count, fmt.money(m.total), `${Math.round(m.share)}%`])}
        />
      }
    >
      <RankedBars color={SERIES.collected.color} items={data.map((m) => ({ key: m.method, label: paymentMethodLabels[m.method], value: m.total, hint: `${Math.round(m.share)}%` }))} />
    </ChartCard>
  );
}
