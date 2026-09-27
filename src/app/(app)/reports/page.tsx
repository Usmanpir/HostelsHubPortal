import { ShieldAlert } from "lucide-react";
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
      {hiddenFinancial ? (
        <p className="mt-8 text-xs text-muted-foreground">Financial reports are hidden because your role doesn&apos;t include financial report access.</p>
      ) : null}
    </>
  );
}
