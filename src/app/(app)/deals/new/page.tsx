import { PageHeader } from "@/components/shared/page-header";
import { DealerDisabled } from "@/components/real-estate/dealer-disabled";
import { DealForm } from "@/components/real-estate/deal-form";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { sp } from "@/lib/page-helpers";
import { getDealPrefill } from "@/services/real-estate/deal-service";
import { listLeadOptions } from "@/services/real-estate/lead-service";
import { listListingOptions } from "@/services/real-estate/listing-service";
import { listAgentOptions } from "@/services/real-estate/shared";

export const metadata = { title: "New deal" };

export default async function NewDealPage({ searchParams }: PageProps<"/deals/new">) {
  const ctx = await requireTenantPage("deals.manage");
  if (!ctx.organization.dealerEnabled) return <DealerDisabled title="New deal" canEnable={can(ctx, "settings.organization")} />;
  const params = await searchParams;
  const prefill = await getDealPrefill(ctx, { leadId: sp(params, "leadId"), listingId: sp(params, "listingId") });
  const [leads, listings, agents] = await Promise.all([
    listLeadOptions(ctx, { includeId: prefill.leadId || null }),
    listListingOptions(ctx, { includeId: prefill.listingId || null }),
    listAgentOptions(ctx),
  ]);
  return (
    <>
      <PageHeader
        title="New deal"
        description="Record the agreed price and commission. Closing the deal updates the lead and listing."
        breadcrumbs={[{ label: "Deals", href: "/deals" }, { label: "New" }]}
      />
      <DealForm
        options={{ leads, listings, agents }}
        initial={{
          leadId: prefill.leadId,
          listingId: prefill.listingId,
          type: prefill.type,
          clientName: prefill.clientName,
          agreedAmount: prefill.agreedAmount,
          agentUserId: agents.some((a) => a.id === prefill.agentUserId) ? prefill.agentUserId : "",
        }}
      />
    </>
  );
}
