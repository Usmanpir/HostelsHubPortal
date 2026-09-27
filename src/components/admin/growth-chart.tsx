"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type GrowthPoint = { month: string; label: string; count: number };

function GrowthTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as GrowthPoint | undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{point.label}</p>
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground tabular">{point.count}</span> new organization{point.count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/** New organizations per month (single series: one hue, no legend). */
export function GrowthChart({ data }: { data: GrowthPoint[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <figure className="flex flex-col gap-2">
      <div className="h-64 w-full" role="img" aria-label={`New organizations per month, ${total} in the last 12 months`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              width={44}
            />
            <Tooltip content={(props) => <GrowthTooltip active={props.active} payload={props.payload} />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
            <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">View as table</summary>
        <table className="mt-2 w-full max-w-sm">
          <thead>
            <tr className="border-b">
              <th className="py-1 text-start font-medium">Month</th>
              <th className="py-1 text-end font-medium">New organizations</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month} className="border-b last:border-b-0">
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-end tabular">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
