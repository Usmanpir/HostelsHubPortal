"use client";

import { DataTable, type Column } from "@/components/data-table/data-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReportBreakdown, ReportRow, ReportTable } from "@/services/reports/types";
import { ReportCell } from "./report-cell";

/** Paginated detail table (server-side paging through the URL). */
export function ReportDetailTable({ reportKey, table }: { reportKey: string; table: ReportTable }) {
  const columns: Column<ReportRow>[] = table.columns.map((c, i) => ({
    id: c.key,
    header: c.header,
    align: c.align,
    hideable: i !== 0,
    defaultHidden: c.defaultHidden,
    hideOnMobile: c.hideOnMobile,
    className: c.align === "end" ? "whitespace-nowrap" : undefined,
    cell: (row) => <ReportCell column={c} row={row} />,
  }));
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">{table.title}</h2>
        <span className="tabular text-sm text-muted-foreground">
          {table.total.toLocaleString()} {table.total === 1 ? "row" : "rows"}
          <span className="hidden print:inline">
            {" "}
            · page {table.page} of {table.pageCount}
          </span>
        </span>
      </div>
      {/* In print, hide the table toolbar and pager; the current page prints as a plain table. */}
      <div className="print:[&>div>div:first-child]:hidden print:[&>div>div:last-child]:hidden">
        <DataTable
          rows={table.rows}
          columns={columns}
          getRowId={(r) => r.id}
          total={table.total}
          page={table.page}
          pageCount={table.pageCount}
          pageSize={table.pageSize}
          hideSearch
          storageKey={`report-${reportKey}`}
          empty={
            <div className="rounded-xl border border-dashed bg-card py-12 text-center text-sm text-muted-foreground">
              Nothing to show for these filters. Try a wider date range or another hostel.
            </div>
          }
        />
      </div>
    </section>
  );
}

/** Small, unpaginated summary table with an optional totals row. */
export function BreakdownCard({ breakdown }: { breakdown: ReportBreakdown }) {
  const cols = breakdown.columns;
  return (
    <Card className="gap-3 break-inside-avoid">
      <CardHeader>
        <CardTitle>{breakdown.title}</CardTitle>
        {breakdown.description ? <CardDescription>{breakdown.description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {breakdown.rows.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">No data for this period.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  {cols.map((c) => (
                    <th key={c.key} className={cn("px-3 py-2 font-medium whitespace-nowrap", c.align === "end" ? "text-end" : "text-start")}>
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {breakdown.rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    {cols.map((c) => (
                      <td key={c.key} className={cn("px-3 py-2", c.align === "end" && "tabular text-end whitespace-nowrap")}>
                        <ReportCell column={c} row={r} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {breakdown.totals ? (
                <tfoot>
                  <tr className="border-t bg-muted/30 font-semibold">
                    {cols.map((c) => (
                      <td key={c.key} className={cn("px-3 py-2", c.align === "end" && "tabular text-end whitespace-nowrap")}>
                        <ReportCell column={{ ...c, hrefKey: undefined }} row={breakdown.totals!} />
                      </td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
