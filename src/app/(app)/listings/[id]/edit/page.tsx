import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { DealerDisabled } from "@/components/real-estate/dealer-disabled";
import { ListingForm } from "@/components/real-estate/listing-form";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { getListing, getListingFormOptions } from "@/services/real-estate/listing-service";

export const metadata = { title: "Edit listing" };

export default async function EditListingPage({ params }: PageProps<"/listings/[id]/edit">) {
  const ctx = await requireTenantPage("listings.manage");
  if (!ctx.organization.dealerEnabled) return <DealerDisabled title="Edit listing" canEnable={can(ctx, "settings.organization")} />;
  const { id } = await params;
  const [listing, options] = await Promise.all([loadOr404(getListing(ctx, id)), getListingFormOptions(ctx)]);
  if (listing.status === "ARCHIVED") redirect(`/listings/${id}`);

  // Keep the current link selectable even if the member can no longer access that property.
  const properties =
    listing.hostel && !options.properties.some((p) => p.id === listing.hostel!.id)
      ? [
          ...options.properties,
          {
            id: listing.hostel.id,
            name: listing.hostel.name,
            city: null,
            address: null,
            units: listing.room ? [{ id: listing.room.id, roomNumber: listing.room.roomNumber }] : [],
          },
        ]
      : options.properties;
  const agents = listing.agent && !options.agents.some((a) => a.id === listing.agent!.id) ? [...options.agents, listing.agent] : options.agents;

  return (
    <>
      <PageHeader
        title={`Edit ${listing.code}`}
        breadcrumbs={[{ label: "Listings", href: "/listings" }, { label: listing.code, href: `/listings/${listing.id}` }, { label: "Edit" }]}
      />
      <ListingForm
        listingId={listing.id}
        options={{ ...options, properties, agents }}
        purposeLocked={listing.status === "SOLD" || listing.status === "RENTED"}
        initial={{
          title: listing.title,
          purpose: listing.purpose,
          propertyType: listing.propertyType,
          price: listing.price,
          priceNegotiable: listing.priceNegotiable,
          areaValue: listing.areaValue ?? undefined,
          areaUnit: listing.areaUnit ?? undefined,
          bedrooms: listing.bedrooms ?? undefined,
          bathrooms: listing.bathrooms ?? undefined,
          furnished: listing.furnished,
          address: listing.address ?? "",
          locality: listing.locality ?? "",
          city: listing.city ?? "",
          description: listing.description ?? "",
          features: listing.features,
          hostelId: listing.hostelId ?? "",
          roomId: listing.roomId ?? "",
          ownerId: listing.ownerId ?? "",
          agentUserId: listing.agentUserId ?? "",
        }}
      />
    </>
  );
}
