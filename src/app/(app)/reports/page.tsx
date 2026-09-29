import Link from "next/link";
import { ArrowUpRight, ShieldAlert, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ReportHub } from "@/components/reports/report-hub";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { sp } from "@/lib/page-helpers";
import { canViewReport, REPORTS, type ReportMeta } from "@/services/reports/registry";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const ctx = await requireTenantPage("reports.view");
  const params = await searchParams;
  const reports = (REPORTS as readonly ReportMeta[]).filter((r) => canViewReport(ctx.permissions, r));
  const hiddenFinancial = !can(ctx, "reports.financial");

  return (
    <>
      <PageHeader
        title="Reports"
        description="Operational and financial reports with filters, charts and CSV / Excel / PDF export."
      />
      {sp(params, "denied") ? (
        <div className="mb-6 flex items-center gap-2 rounded-lg border bg-warning-soft px-3 py-2 text-sm text-warning">
          <ShieldAlert className="size-4 shrink-0" />
          You don&apos;t have access to that report.
        </div>
      ) : null}
      <ReportHub reports={reports} />
      {can(ctx, "audit.view") ? (
        <section className="mt-8 flex flex-col gap-3" aria-labelledby="reports-audit">
          <div>
            <h2 id="reports-audit" className="text-base font-semibold tracking-tight">
              Activity &amp; compliance
            </h2>
            <p className="text-sm text-muted-foreground">Who changed what, and when.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Link
              href="/audit-log"
              className="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <ShieldCheck className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">Audit log</span>
                <span className="text-sm text-muted-foreground">Every important change across your organization, with before and after values.</span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 rtl:-scale-x-100" />
            </Link>
          </div>
        </section>
      ) : null}
      {hiddenFinancial ? (
        <p className="mt-8 text-xs text-muted-foreground">Financial reports are hidden because your role doesn&apos;t include financial report access.</p>
      ) : null}
    </>
  );
}
