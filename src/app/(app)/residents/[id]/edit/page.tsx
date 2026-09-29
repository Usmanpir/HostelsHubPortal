import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { ResidentForm } from "@/components/residents/resident-form";
import { getTenantContext, requireTenantPage } from "@/lib/tenant/server";
import { termsFor } from "@/lib/terms";
import { loadOr404 } from "@/lib/page-helpers";
import { toDateInput } from "@/lib/format";
import { residentStatusLabels } from "@/config/labels";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { getResident } from "@/services/resident/resident-service";

export async function generateMetadata() {
  const ctx = await getTenantContext();
  return { title: `Edit ${termsFor(ctx?.organization.businessType).resident.toLowerCase()}` };
}

export default async function EditResidentPage({ params }: PageProps<"/residents/[id]/edit">) {
  const ctx = await requireTenantPage("residents.manage");
  const { id } = await params;
  const [r, hostels] = await Promise.all([loadOr404(getResident(ctx, id)), listHostelOptions(ctx)]);
  if (r.status === "ARCHIVED") notFound();
  const editableStatus = r.status === "ACTIVE" || r.status === "NOTICE" || r.status === "SUSPENDED" ? r.status : "ACTIVE";

  return (
    <>
      <PageHeader
        title={`Edit ${r.name}`}
        breadcrumbs={[
          { label: termsFor(ctx.organization.businessType).residents, href: "/residents" },
          { label: r.name, href: `/residents/${r.id}` },
          { label: "Edit" },
        ]}
      />
      <ResidentForm
        residentId={r.id}
        hostels={hostels.filter((h) => h.status !== "ARCHIVED" || h.id === r.hostelId)}
        lockHostel={!!r.currentStay}
        lockedStatus={r.status === "CHECKED_OUT" ? residentStatusLabels.CHECKED_OUT : undefined}
        initial={{
          hostelId: r.hostelId,
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email ?? "",
          phone: r.phone,
          alternatePhone: r.alternatePhone ?? "",
          gender: r.gender ?? "",
          dateOfBirth: toDateInput(r.dateOfBirth),
          idNumber: r.idNumber ?? "",
          nationality: r.nationality ?? "",
          address: r.address ?? "",
          city: r.city ?? "",
          occupation: r.occupation ?? "",
          institution: r.institution ?? "",
          joiningDate: toDateInput(r.joiningDate),
          expectedLeavingDate: toDateInput(r.expectedLeavingDate),
          emergencyContactName: r.emergencyContactName ?? "",
          emergencyContactPhone: r.emergencyContactPhone ?? "",
          emergencyContactRelation: r.emergencyContactRelation ?? "",
          guardianName: r.guardianName ?? "",
          guardianPhone: r.guardianPhone ?? "",
          status: editableStatus,
          notes: r.notes ?? "",
          photoFileId: r.photoFileId ?? "",
        }}
      />
    </>
  );
}
