import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { ExportMenu } from "@/components/data-table/export-menu";
import { PrintButton } from "@/components/reports/print-button";
import { ReportView } from "@/components/reports/report-view";
import { requireTenantPage } from "@/lib/tenant/server";
import { loadOr404 } from "@/lib/page-helpers";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { canViewReport, getReportMeta } from "@/services/reports/registry";
import { runReport } from "@/services/reports/report-service";

export async function generateMetadata({ params }: PageProps<"/reports/[report]">) {
  const { report } = await params;
  return { title: getReportMeta(report)?.title ? `${getReportMeta(report)!.title} report` : "Report" };
}

export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[report]">) {
  const ctx = await requireTenantPage("reports.view");
  const { report } = await params;
  const meta = getReportMeta(report);
  if (!meta) notFound();
  if (!canViewReport(ctx.permissions, meta)) redirect("/reports?denied=1");

  const query = await searchParams;
  const [result, hostels] = await Promise.all([
    loadOr404(runReport(ctx, meta.key, query)),
    listHostelOptions(ctx, { includeArchived: true }),
  ]);
  const active = ctx.activeHostelId ? hostels.find((h) => h.id === ctx.activeHostelId) : null;

  return (
    <>
      <PageHeader
        title={meta.title}
        description={meta.description}
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: meta.title }]}
        actions={
          <div className="no-print flex items-center gap-2">
            <ExportMenu endpoint={`/api/reports/${meta.key}`} />
            <PrintButton />
          </div>
        }
      />
      <ReportView
        meta={meta}
        result={result}
        hostels={hostels.map((h) => ({ id: h.id, name: h.name }))}
        defaultHostelLabel={active ? `${active.name} (current)` : "All hostels"}
        organizationName={ctx.organization.brandName || ctx.organization.name}
        generatedAt={new Date().toISOString()}
      />
    </>
  );
}
