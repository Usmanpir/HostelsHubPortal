import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { MaintenanceForm } from "@/components/operations/maintenance-form";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { listHostelOptions } from "@/services/hostel/hostel-service";

export const metadata = { title: "New maintenance request" };

export default async function NewMaintenancePage() {
  const ctx = await requireTenantPage("maintenance.manage");
  const hostels = (await listHostelOptions(ctx)).filter((h) => h.status !== "ARCHIVED");
  const defaultHostelId = ctx.activeHostelId && hostels.some((h) => h.id === ctx.activeHostelId) ? ctx.activeHostelId : null;

  return (
    <>
      <PageHeader
        title="New maintenance request"
        description="Log an issue, attach photos and assign it to staff."
        breadcrumbs={[{ label: "Maintenance", href: "/operations/maintenance" }, { label: "New" }]}
      />
      {hostels.length === 0 ? (
        <EmptyState icon={Building2} title="No hostels available" description="You need access to at least one active hostel to log maintenance." />
      ) : (
        <MaintenanceForm
          hostels={hostels.map((h) => ({ id: h.id, name: h.name }))}
          defaultHostelId={defaultHostelId}
          canManageRooms={can(ctx, "rooms.manage")}
        />
      )}
    </>
  );
}
