import { PageHeader } from "@/components/shared/page-header";
import { DealerDisabled } from "@/components/real-estate/dealer-disabled";
import { LeadForm } from "@/components/real-estate/lead-form";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { sp } from "@/lib/page-helpers";
import { listListingOptions } from "@/services/real-estate/listing-service";
import { listAgentOptions } from "@/services/real-estate/shared";

export const metadata = { title: "Add lead" };

export default async function NewLeadPage({ searchParams }: PageProps<"/leads/new">) {
  const ctx = await requireTenantPage("leads.manage");
  if (!ctx.organization.dealerEnabled) return <DealerDisabled title="Add lead" canEnable={can(ctx, "settings.organization")} />;
  const params = await searchParams;
  const [listings, agents] = await Promise.all([listListingOptions(ctx), listAgentOptions(ctx)]);
  const listing = listings.find((l) => l.id === sp(params, "listingId"));
  return (
    <>
      <PageHeader
        title="Add lead"
        description="Record an enquiry from a call, walk-in, WhatsApp or referral."
        breadcrumbs={[{ label: "Leads", href: "/leads" }, { label: "New" }]}
      />
      <LeadForm
        listings={listings}
        agents={agents}
        initial={{
          listingId: listing?.id ?? "",
          interest: listing?.purpose,
          assignedUserId: listing?.agentUserId ?? (agents.some((a) => a.id === ctx.userId) ? ctx.userId : ""),
        }}
      />
    </>
  );
}
