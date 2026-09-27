import type { PlanLimits } from "@/config/plans";
import { cn } from "@/lib/utils";
import { formatLimit, limitRows, type BillingUsage } from "./billing-types";

/** Usage vs plan limits. Server-renderable (no client hooks). */
export function UsageMeters({ usage, limits }: { usage: BillingUsage; limits: PlanLimits | null }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div>
        <p className="text-sm font-semibold">Usage</p>
        <p className="text-sm text-muted-foreground">Archived records don&apos;t count towards your limits.</p>
      </div>
      <ul className="flex flex-col gap-4">
        {limitRows.map((row) => {
          const used = usage[row.usage];
          const max = limits ? limits[row.key] : null;
          const pct = max === null ? 0 : max === 0 ? 100 : Math.min(100, Math.round((used / max) * 100));
          const tone = max === null ? "bg-primary" : pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-primary";
          return (
            <li key={row.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{row.label}</span>
                <span className="text-muted-foreground tabular">
                  <span className="font-medium text-foreground">{formatLimit(used, row.unit)}</span>
                  {" / "}
                  {formatLimit(max, row.unit)}
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={`${row.label} usage`}
                aria-valuemin={0}
                aria-valuemax={max ?? undefined}
                aria-valuenow={used}
              >
                <div
                  className={cn("h-full rounded-full transition-all", tone, max === null && "opacity-30")}
                  style={{ width: max === null ? "100%" : `${pct}%` }}
                />
              </div>
              {max !== null && pct >= 100 ? (
                <p className="text-xs text-danger">Limit reached — upgrade to add more.</p>
              ) : max !== null && pct >= 80 ? (
                <p className="text-xs text-warning">{pct}% used</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
