import { Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { FloorDialog } from "@/components/hostels/floor-dialog";
import { FloorsTable } from "@/components/hostels/floors-table";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { listFloors } from "@/services/hostel/structure-service";
import { listHostelOptions } from "@/services/hostel/hostel-service";

export const metadata = { title: "Floors" };

export default async function FloorsPage() {
  const ctx = await requireTenantPage("rooms.view");
  const [floors, hostels] = await Promise.all([listFloors(ctx), listHostelOptions(ctx)]);
  const canManage = can(ctx, "rooms.manage") && hostels.length > 0;
  const addButton = canManage ? (
    <FloorDialog
      hostels={hostels}
      defaultHostelId={ctx.activeHostelId}
      trigger={
        <Button>
          <Plus />
          Add floor
        </Button>
      }
    />
  ) : null;

  return (
    <>
      <PageHeader
        title="Floors"
        description={ctx.activeHostelId ? "Floors in the selected hostel." : "Floors across all your hostels."}
        breadcrumbs={[{ label: "Hostels", href: "/hostels" }, { label: "Floors" }]}
        actions={addButton}
      />
      <SectionTabs group="roomsAndBeds" />
      {floors.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No floors yet"
          description={hostels.length ? "Add floors to organise rooms inside each hostel." : "Create a hostel first, then add its floors."}
          action={addButton}
        />
      ) : (
        <FloorsTable floors={floors} hostels={hostels} />
      )}
    </>
  );
}
