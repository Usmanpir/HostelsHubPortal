import { PageHeader } from "@/components/shared/page-header";
import { HostelForm } from "@/components/hostels/hostel-form";
import { requireTenantPage } from "@/lib/tenant/server";
import { listStaffOptions } from "@/services/hostel/staff-options";

export const metadata = { title: "Add hostel" };

export default async function NewHostelPage() {
  const ctx = await requireTenantPage("hostels.manage");
  const managers = await listStaffOptions(ctx);
  return (
    <>
      <PageHeader
        title="Add hostel"
        breadcrumbs={[{ label: "Hostels", href: "/hostels" }, { label: "New" }]}
        description="You can add floors, rooms and beds right after creating the hostel."
      />
      <HostelForm managers={managers} />
    </>
  );
}
