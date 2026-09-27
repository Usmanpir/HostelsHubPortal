import { PageHeader } from "@/components/shared/page-header";
import { ResidentForm } from "@/components/residents/resident-form";
import { requireTenantPage } from "@/lib/tenant/server";
import { sp } from "@/lib/page-helpers";
import { todayInTimeZone } from "@/lib/format";
import { listHostelOptions } from "@/services/hostel/hostel-service";

export const metadata = { title: "Add resident" };

export default async function NewResidentPage({ searchParams }: PageProps<"/residents/new">) {
  const ctx = await requireTenantPage("residents.manage");
  const params = await searchParams;
  const hostels = (await listHostelOptions(ctx)).filter((h) => h.status !== "ARCHIVED");
  const returnTo = sp(params, "returnTo") === "check-in" ? { kind: "check-in" as const, bedId: sp(params, "bedId") } : undefined;
  const defaultHostel =
    ctx.activeHostelId && hostels.some((h) => h.id === ctx.activeHostelId) ? ctx.activeHostelId : hostels.length === 1 ? hostels[0]!.id : "";

  return (
    <>
      <PageHeader
        title="Add resident"
        description={returnTo ? "Register the resident, then continue with the check-in." : "Register a resident. You can check them in to a bed right after."}
        breadcrumbs={[
          { label: "Residents", href: "/residents" },
          ...(returnTo ? [{ label: "Check in", href: "/residents/check-in" }] : []),
          { label: "New" },
        ]}
      />
      <ResidentForm
        hostels={hostels}
        returnTo={returnTo}
        initial={{
          hostelId: defaultHostel,
          firstName: "",
          lastName: "",
          phone: "",
          email: "",
          status: "ACTIVE",
          joiningDate: todayInTimeZone(ctx.organization.timezone),
          photoFileId: "",
        }}
      />
    </>
  );
}
