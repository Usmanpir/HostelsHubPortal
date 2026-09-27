import { PageHeader } from "@/components/shared/page-header";
import { AuditLogTable, type AuditRow } from "@/components/reports/audit-log-table";
import { requireTenantPage } from "@/lib/tenant/server";
import { getAuditLogFacets, listAuditLogs } from "@/services/reports/audit-log-service";

export const metadata = { title: "Audit log" };

export default async function AuditLogPage({ searchParams }: PageProps<"/audit-log">) {
  const ctx = await requireTenantPage("audit.view");
  const params = await searchParams;
  const [data, facets] = await Promise.all([listAuditLogs(ctx, params), getAuditLogFacets(ctx)]);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every important change in your organization — who did what, and when. Click an event to see what changed."
      />
      <AuditLogTable data={{ ...data, items: data.items as AuditRow[] }} actionOptions={facets.actionPrefixes} userOptions={facets.users} />
    </>
  );
}
