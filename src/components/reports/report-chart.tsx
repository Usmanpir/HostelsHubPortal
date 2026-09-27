"use client";

import { useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { ReportChart } from "@/services/reports/types";
import { seriesColor, VizTokens } from "./viz-tokens";
import { useValueFormat } from "./use-value-format";

const PLOT_HEIGHT = 260;
const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };

type Fmt = ReturnType<typeof useValueFormat>;

function hasData(chart: ReportChart) {
  return chart.data.some((d) => chart.series.some((s) => Number(d[s.key] ?? 0) !== 0));
}

/** One tooltip listing every series at the hovered x — value first, name second. */
function ChartTooltip({ active, payload, chart, fmt }: TooltipContentProps & { chart: ReportChart; fmt: Fmt }) {
  if (!active || !payload?.length) return null;
  const datum = (payload[0] as { payload?: Record<string, string | number> }).payload;
  if (!datum) return null;
  const x = String(datum[chart.xKey] ?? "");
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1.5 font-medium text-muted-foreground">{fmt.period(chart.xFormat, x, true)}</div>
      <div className="flex flex-col gap-1">
        {chart.series.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: seriesColor(i) }} aria-hidden />
            <span className="tabular font-semibold text-foreground">{fmt.value(chart.format, Number(datum[s.key] ?? 0))}</span>
            <span className="text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ chart }: { chart: ReportChart }) {
  if (chart.series.length < 2) return null;
  const line = chart.kind === "line";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {chart.series.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span
            className={cn("shrink-0", line ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-[3px]")}
            style={{ background: seriesColor(i) }}
            aria-hidden
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function Plot({ chart, fmt }: { chart: ReportChart; fmt: Fmt }) {
  const tooltip = (
    <Tooltip
      content={(props) => <ChartTooltip {...props} chart={chart} fmt={fmt} />}
      cursor={chart.kind === "line" ? { stroke: "var(--border)", strokeWidth: 1 } : { fill: "var(--muted)", opacity: 0.6 }}
      isAnimationActive={false}
    />
  );
  const grid = <CartesianGrid vertical={false} stroke="var(--border)" />;
  const xAxis = (
    <XAxis
      dataKey={chart.xKey}
      tickLine={false}
      axisLine={{ stroke: "var(--border)" }}
      tick={AXIS_TICK}
      tickFormatter={(v: string) => fmt.period(chart.xFormat, String(v))}
      minTickGap={12}
      tickMargin={8}
    />
  );
  const yAxis = (
    <YAxis
      tickLine={false}
      axisLine={false}
      tick={AXIS_TICK}
      width={chart.format === "money" ? 64 : 44}
      tickFormatter={(v: number) => fmt.axis(chart.format, v)}
      allowDecimals={chart.format !== "number"}
      domain={chart.format === "percent" ? [0, (max: number) => Math.max(100, Math.ceil(max))] : [0, "auto"]}
    />
  );

  if (chart.kind === "bar") {
    // Horizontal bars for categories; value at the bar tip.
    const height = Math.max(120, chart.data.length * 36 + 24);
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chart.data} layout="vertical" margin={{ top: 4, right: 72, bottom: 4, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide domain={chart.format === "percent" ? [0, 100] : [0, "auto"]} />
          <YAxis
            type="category"
            dataKey={chart.xKey}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            width={120}
            tickFormatter={(v: string) => (String(v).length > 18 ? `${String(v).slice(0, 17)}…` : String(v))}
          />
          {tooltip}
          {chart.series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={seriesColor(i)} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
              <LabelList
                dataKey={s.key}
                position="right"
                offset={8}
                className="tabular"
                style={{ fill: "var(--foreground)", fontSize: 12 }}
                formatter={(v) => fmt.value(chart.format, Number(v ?? 0))}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chart.kind === "line") {
    if (chart.series.length === 1) {
      const s = chart.series[0]!;
      return (
        <ResponsiveContainer width="100%" height={PLOT_HEIGHT}>
          <AreaChart data={chart.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            <Area
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={seriesColor(0)}
              strokeWidth={2}
              fill={seriesColor(0)}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      );
    }
    return (
      <ResponsiveContainer width="100%" height={PLOT_HEIGHT}>
        <LineChart data={chart.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {chart.series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={seriesColor(i)}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const stacked = chart.kind === "stacked";
  const last = chart.series.length - 1;
  return (
    <ResponsiveContainer width="100%" height={PLOT_HEIGHT}>
      <BarChart data={chart.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="20%">
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        {chart.series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={seriesColor(i)}
            stackId={stacked ? "stack" : undefined}
            // Rounded data-end, square at the baseline; the surface-coloured stroke is the 2px gap between stacked segments.
            radius={stacked ? (i === last ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0]}
            stroke={stacked ? "var(--card)" : undefined}
            strokeWidth={stacked ? 1 : 0}
            maxBarSize={24}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function DataView({ chart, fmt }: { chart: ReportChart; fmt: Fmt }) {
  return (
    <div className="max-h-72 overflow-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-start font-medium">{chart.xFormat === "month" ? "Month" : chart.xFormat === "day" ? "Day" : "Category"}</th>
            {chart.series.map((s) => (
              <th key={s.key} className="px-3 py-2 text-end font-medium">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.data.map((d, i) => (
            <tr key={i} className="border-t">
              <td className="px-3 py-1.5">{fmt.period(chart.xFormat, String(d[chart.xKey] ?? ""), true)}</td>
              {chart.series.map((s) => (
                <td key={s.key} className="tabular px-3 py-1.5 text-end">
                  {fmt.value(chart.format, Number(d[s.key] ?? 0))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A chart card with legend, hover tooltip and a table-view twin. */
export function ReportChartCard({
  chart,
  className,
  action,
  emptyMessage = "No data for this period yet.",
}: {
  chart: ReportChart;
  className?: string;
  action?: React.ReactNode;
  emptyMessage?: string;
}) {
  const fmt = useValueFormat();
  const [view, setView] = useState<"chart" | "table">("chart");
  const filled = hasData(chart);
  return (
    <Card className={cn("viz gap-3", className)}>
      <VizTokens />
      <CardHeader>
        <CardTitle>{chart.title}</CardTitle>
        {chart.description ? <CardDescription>{chart.description}</CardDescription> : null}
        <CardAction className="no-print flex items-center gap-2">
          {action}
          {filled ? (
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              spacing={0}
              value={view}
              onValueChange={(v) => v && setView(v as "chart" | "table")}
              aria-label="Chart or table view"
            >
              <ToggleGroupItem value="chart" aria-label="Chart view">
                <BarChart3 />
              </ToggleGroupItem>
              <ToggleGroupItem value="table" aria-label="Table view">
                <Table2 />
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!filled ? (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">{emptyMessage}</div>
        ) : view === "table" ? (
          <DataView chart={chart} fmt={fmt} />
        ) : (
          <>
            <Legend chart={chart} />
            <div role="img" aria-label={`${chart.title} chart. Switch to table view for exact values.`}>
              <Plot chart={chart} fmt={fmt} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
