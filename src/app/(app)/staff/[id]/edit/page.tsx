import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { StaffForm } from "@/components/staff/staff-form";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { fullName, toDateInput } from "@/lib/format";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { getStaff, listLinkableMembers } from "@/services/staff/staff-service";

export default async function EditStaffPage({ params }: PageProps<"/staff/[id]/edit">) {
  const ctx = await requireTenantPage("staff.manage");
  const { id } = await params;
  const [staff, hostels, members] = await Promise.all([
    loadOr404(getStaff(ctx, id)),
    listHostelOptions(ctx),
    listLinkableMembers(ctx, id),
  ]);
  if (staff.archivedAt) redirect(`/staff/${id}`);
  const name = fullName(staff);

  // Keep already-assigned (possibly archived) hostels selectable; hostels outside
  // this member's access are preserved by the service and not shown.
  const accessible = staff.hostels.filter((h) => ctx.accessibleHostelIds.includes(h.hostel.id));
  const options = [
    ...hostels.map((h) => ({ id: h.id, name: h.name, code: h.code })),
    ...accessible.filter((a) => !hostels.some((h) => h.id === a.hostel.id)).map((a) => a.hostel),
  ];
  const primary = accessible.find((h) => h.isPrimary)?.hostel.id ?? "";

  return (
    <>
      <PageHeader
        title={`Edit ${name}`}
        breadcrumbs={[
          { label: "Staff", href: "/staff" },
          { label: name, href: `/staff/${id}` },
          { label: "Edit" },
        ]}
      />
      <StaffForm
        staffId={id}
        hostels={options}
        members={members}
        canSetSalary={can(ctx, "payroll.view")}
        currentPhotoFileId={staff.photoFileId}
        displayName={name}
        initial={{
          firstName: staff.firstName,
          lastName: staff.lastName,
          phone: staff.phone,
          email: staff.email ?? "",
          idNumber: staff.idNumber ?? "",
          address: staff.address ?? "",
          dateOfBirth: toDateInput(staff.dateOfBirth),
          joiningDate: toDateInput(staff.joiningDate),
          designation: staff.designation,
          department: staff.department ?? "",
          employmentType: staff.employmentType,
          status: staff.status,
          salary: staff.salary ?? 0,
          notes: staff.notes ?? "",
          hostelIds: accessible.map((h) => h.hostel.id),
          primaryHostelId: primary,
          userId: staff.userId ?? "",
        }}
      />
    </>
  );
}
