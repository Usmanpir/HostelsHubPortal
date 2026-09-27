import Link from "next/link";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StaffForm } from "@/components/staff/staff-form";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { todayInTimeZone } from "@/lib/format";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { listLinkableMembers } from "@/services/staff/staff-service";

export const metadata = { title: "Add staff" };

export default async function NewStaffPage() {
  const ctx = await requireTenantPage("staff.manage");
  const [hostels, members] = await Promise.all([listHostelOptions(ctx), listLinkableMembers(ctx)]);
  const defaultHostel = ctx.activeHostelId && hostels.some((h) => h.id === ctx.activeHostelId) ? ctx.activeHostelId : null;

  return (
    <>
      <PageHeader
        title="Add staff member"
        breadcrumbs={[{ label: "Staff", href: "/staff" }, { label: "New" }]}
        description="An employee code is assigned automatically."
      />
      {hostels.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Create a hostel first"
          description="Staff are assigned to one or more hostels."
          action={
            can(ctx, "hostels.manage") ? (
              <Button asChild>
                <Link href="/hostels/new">Add hostel</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <StaffForm
          hostels={hostels}
          members={members}
          canSetSalary={can(ctx, "payroll.view")}
          initial={{
            joiningDate: todayInTimeZone(ctx.organization.timezone),
            ...(defaultHostel ? { hostelIds: [defaultHostel], primaryHostelId: defaultHostel } : {}),
          }}
        />
      )}
    </>
  );
}
