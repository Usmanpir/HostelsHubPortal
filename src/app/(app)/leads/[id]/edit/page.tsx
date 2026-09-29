import { PageHeader } from "@/components/shared/page-header";
import { DealerDisabled } from "@/components/real-estate/dealer-disabled";
import { LeadForm } from "@/components/real-estate/lead-form";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { toDateInput } from "@/lib/format";
import { getLead } from "@/services/real-estate/lead-service";
import { listListingOptions } from "@/services/real-estate/listing-service";
import { listAgentOptions } from "@/services/real-estate/shared";

export const metadata = { title: "Edit lead" };

export default async function EditLeadPage({ params }: PageProps<"/leads/[id]/edit">) {
  const ctx = await requireTenantPage("leads.manage");
  if (!ctx.organization.dealerEnabled) return <DealerDisabled title="Edit lead" canEnable={can(ctx, "settings.organization")} />;
  const { id } = await params;
  const lead = await loadOr404(getLead(ctx, id));
  const [listings, agents] = await Promise.all([listListingOptions(ctx, { includeId: lead.listingId }), listAgentOptions(ctx)]);
  const agentList = lead.assignedTo && !agents.some((a) => a.id === lead.assignedTo!.id) ? [...agents, lead.assignedTo] : agents;
  return (
    <>
      <PageHeader
        title={`Edit ${lead.name}`}
        breadcrumbs={[{ label: "Leads", href: "/leads" }, { label: lead.code, href: `/leads/${lead.id}` }, { label: "Edit" }]}
      />
      <LeadForm
        leadId={lead.id}
        listings={listings}
        agents={agentList}
        initial={{
          name: lead.name,
          phone: lead.phone ?? "",
          email: lead.email ?? "",
          source: lead.source,
          interest: lead.interest ?? "",
          listingId: lead.listingId ?? "",
          budgetMin: lead.budgetMin ?? undefined,
          budgetMax: lead.budgetMax ?? undefined,
          preferredLocation: lead.preferredLocation ?? "",
          message: lead.message ?? "",
          notes: lead.notes ?? "",
          assignedUserId: lead.assignedUserId ?? "",
          nextFollowUpAt: toDateInput(lead.nextFollowUpAt),
        }}
      />
    </>
  );
}
