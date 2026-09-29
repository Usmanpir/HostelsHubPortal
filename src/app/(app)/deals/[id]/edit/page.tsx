import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { DealerDisabled } from "@/components/real-estate/dealer-disabled";
import { DealForm } from "@/components/real-estate/deal-form";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { toDateInput } from "@/lib/format";
import { computeCommission } from "@/lib/validation/real-estate";
import { getDeal } from "@/services/real-estate/deal-service";
import { listLeadOptions } from "@/services/real-estate/lead-service";
import { listListingOptions } from "@/services/real-estate/listing-service";
import { listAgentOptions } from "@/services/real-estate/shared";

export const metadata = { title: "Edit deal" };

export default async function EditDealPage({ params }: PageProps<"/deals/[id]/edit">) {
  const ctx = await requireTenantPage("deals.manage");
  if (!ctx.organization.dealerEnabled) return <DealerDisabled title="Edit deal" canEnable={can(ctx, "settings.organization")} />;
  const { id } = await params;
  const d = await loadOr404(getDeal(ctx, id));
  if (!d.access.canEdit) redirect(`/deals/${id}`);
  const [leads, listings, agents] = await Promise.all([
    listLeadOptions(ctx, { includeId: d.leadId }),
    listListingOptions(ctx, { includeId: d.listingId }),
    listAgentOptions(ctx),
  ]);
  const agentList = d.agent && !agents.some((a) => a.id === d.agent!.id) ? [...agents, { id: d.agent.id, name: d.agent.name }] : agents;
  // Leave the amount blank when it equals the computed default so it follows later edits.
  const custom = d.commissionAmount !== computeCommission(d.agreedAmount, d.commissionPercent);
  return (
    <>
      <PageHeader
        title={`Edit ${d.code}`}
        breadcrumbs={[{ label: "Deals", href: "/deals" }, { label: d.code, href: `/deals/${d.id}` }, { label: "Edit" }]}
      />
      <DealForm
        dealId={d.id}
        options={{ leads, listings, agents: agentList }}
        initial={{
          type: d.type,
          leadId: d.leadId ?? "",
          listingId: d.listingId ?? "",
          clientName: d.clientName,
          agreedAmount: d.agreedAmount,
          commissionPercent: d.commissionPercent,
          commissionAmount: custom ? d.commissionAmount : undefined,
          agentUserId: d.agentUserId ?? "",
          expectedCloseDate: toDateInput(d.expectedCloseDate),
          notes: d.notes ?? "",
        }}
      />
    </>
  );
}
