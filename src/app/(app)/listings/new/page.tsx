import { PageHeader } from "@/components/shared/page-header";
import { DealerDisabled } from "@/components/real-estate/dealer-disabled";
import { ListingForm } from "@/components/real-estate/listing-form";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { getListingFormOptions } from "@/services/real-estate/listing-service";

export const metadata = { title: "Add listing" };

export default async function NewListingPage() {
  const ctx = await requireTenantPage("listings.manage");
  if (!ctx.organization.dealerEnabled) return <DealerDisabled title="Add listing" canEnable={can(ctx, "settings.organization")} />;
  const options = await getListingFormOptions(ctx);
  return (
    <>
      <PageHeader
        title="Add listing"
        description="Listings start as drafts. Add photos, then activate and publish when ready."
        breadcrumbs={[{ label: "Listings", href: "/listings" }, { label: "New" }]}
      />
      <ListingForm options={options} initial={{ agentUserId: options.agents.some((a) => a.id === ctx.userId) ? ctx.userId : "" }} />
    </>
  );
}
