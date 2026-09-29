import { PageHeader } from "@/components/shared/page-header";
import { HostelForm } from "@/components/hostels/hostel-form";
import { requireTenantPage } from "@/lib/tenant/server";
import { loadOr404 } from "@/lib/page-helpers";
import { getHostel } from "@/services/hostel/hostel-service";
import { listStaffOptions } from "@/services/hostel/staff-options";
import { listOwnerOptions } from "@/services/hostel/owner-options";
import { termsFor } from "@/lib/terms";

export default async function EditHostelPage({ params }: PageProps<"/hostels/[id]/edit">) {
  const ctx = await requireTenantPage("hostels.manage");
  const { id } = await params;
  const t = termsFor(ctx.organization.businessType);
  const [hostel, managers, owners] = await Promise.all([
    loadOr404(getHostel(ctx, id)),
    listStaffOptions(ctx),
    listOwnerOptions(ctx),
  ]);
  return (
    <>
      <PageHeader
        title={`Edit ${hostel.name}`}
        breadcrumbs={[
          { label: t.properties, href: "/hostels" },
          { label: hostel.name, href: `/hostels/${hostel.id}` },
          { label: "Edit" },
        ]}
      />
      <HostelForm
        hostelId={hostel.id}
        managers={managers}
        owners={owners}
        initial={{
          kind: hostel.kind,
          rentalMode: hostel.rentalMode,
          ownerId: hostel.ownerId ?? "",
          managementFeePercent: hostel.managementFeePercent ?? undefined,
          name: hostel.name,
          code: hostel.code,
          type: hostel.type,
          gender: hostel.gender,
          status: hostel.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
          address: hostel.address ?? "",
          city: hostel.city ?? "",
          country: hostel.country ?? "",
          phone: hostel.phone ?? "",
          email: hostel.email ?? "",
          description: hostel.description ?? "",
          managerStaffId: hostel.managerStaffId ?? "",
          amenities: hostel.amenities,
          rules: hostel.rules ?? "",
          defaultBedRent: hostel.defaultBedRent ?? undefined,
          defaultDeposit: hostel.defaultDeposit ?? undefined,
          admissionFee: hostel.admissionFee ?? undefined,
          rentDueDay: hostel.rentDueDay,
          lateFeeAmount: hostel.lateFeeAmount ?? undefined,
          lateFeeGraceDays: hostel.lateFeeGraceDays,
        }}
      />
    </>
  );
}
