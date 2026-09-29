import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { RequestsTable } from "@/components/residents/requests-table";
import { getTenantContext, requireTenantPage } from "@/lib/tenant/server";
import { termsFor } from "@/lib/terms";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { listResidentRequests } from "@/services/resident/request-service";
import { parseRequestFilters } from "@/services/resident/filters";
import { approvalStatusLabels, optionsFrom, residentRequestTypeLabels } from "@/config/labels";

export async function generateMetadata() {
  const ctx = await getTenantContext();
  return { title: `${termsFor(ctx?.organization.businessType).resident} requests` };
}

export default async function ResidentRequestsPage({ searchParams }: PageProps<"/residents/requests">) {
  const ctx = await requireTenantPage("requests.view");
  const t = termsFor(ctx.organization.businessType);
  const params = await searchParams;
  const filters = parseRequestFilters(params);
  const [data, hostels] = await Promise.all([listResidentRequests(ctx, filters), listHostelOptions(ctx)]);
  const showHostel = !ctx.activeHostelId && hostels.length > 1;
  const filtered = !!(filters.q || (filters.status && filters.status !== "ALL") || filters.type || filters.residentId || filters.hostelId);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {t.resident} requests
            {data.pending > 0 ? <StatusBadge tone="warning">{data.pending} pending</StatusBadge> : null}
          </span>
        }
        description={`${t.unit} changes, leave and other requests submitted from the ${t.resident.toLowerCase()} portal.`}
        breadcrumbs={[{ label: t.residents, href: "/residents" }, { label: "Requests" }]}
      />
      <RequestsTable
        data={data}
        showHostel={showHostel}
        filters={[
          { key: "status", label: "Status", options: optionsFrom(approvalStatusLabels) },
          { key: "type", label: "Type", options: optionsFrom(residentRequestTypeLabels) },
          ...(showHostel ? [{ key: "hostelId", label: t.property, options: hostels.map((h) => ({ value: h.id, label: h.name })) }] : []),
        ]}
        empty={
          <EmptyState
            icon={Inbox}
            title={filtered ? "No requests match your filters" : "No requests yet"}
            description={filtered ? "Try a different search or filter." : "Requests residents submit from the portal will appear here."}
          />
        }
      />
    </>
  );
}
