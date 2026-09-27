"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import type { ReportColumn, ReportRow } from "@/services/reports/types";
import { useValueFormat } from "./use-value-format";

/** Render one generic report cell according to its column definition. */
export function ReportCell({ column, row, className }: { column: ReportColumn; row: ReportRow; className?: string }) {
  const fmt = useValueFormat();
  const raw = row[column.key];
  const href = column.hrefKey ? row[column.hrefKey] : null;
  const sub = column.subKey ? row[column.subKey] : null;

  if (column.format === "badge") {
    if (raw === null || raw === undefined) return <span className="text-muted-foreground">—</span>;
    const key = String(raw);
    return (
      <StatusBadge tone={column.tones?.[key] ?? "neutral"} dot={!!column.tones}>
        {column.labels?.[key] ?? key}
      </StatusBadge>
    );
  }

  const text = fmt.value(column.format, raw);
  const negative = column.format === "money" && typeof raw === "number" && raw < 0;
  const main =
    typeof href === "string" && href ? (
      <Link href={href} className="font-medium hover:text-primary hover:underline underline-offset-4">
        {text}
      </Link>
    ) : (
      <span className={cn(text === "—" && "text-muted-foreground", negative && "text-danger")}>{text}</span>
    );

  if (sub === null || sub === undefined || sub === "") return <span className={className}>{main}</span>;
  return (
    <span className={cn("flex min-w-0 flex-col", className)}>
      {main}
      <span className="truncate text-xs text-muted-foreground">{String(sub)}</span>
    </span>
  );
}
