import { PageHeader } from "@/components/shared/page-header";
import { ResidentForm } from "@/components/residents/resident-form";
import { getTenantContext, requireTenantPage } from "@/lib/tenant/server";
import { termsFor } from "@/lib/terms";
import { sp } from "@/lib/page-helpers";
import { todayInTimeZone } from "@/lib/format";
import { listHostelOptions } from "@/services/hostel/hostel-service";

export async function generateMetadata() {
  const ctx = await getTenantContext();
  return { title: `Add ${termsFor(ctx?.organization.businessType).resident.toLowerCase()}` };
}

export default async function NewResidentPage({ searchParams }: PageProps<"/residents/new">) {
  const ctx = await requireTenantPage("residents.manage");
  const t = termsFor(ctx.organization.businessType);
  const params = await searchParams;
  const hostels = (await listHostelOptions(ctx)).filter((h) => h.status !== "ARCHIVED");
  const returnTo = sp(params, "returnTo") === "check-in" ? { kind: "check-in" as const, bedId: sp(params, "bedId") } : undefined;
  const defaultHostel =
    ctx.activeHostelId && hostels.some((h) => h.id === ctx.activeHostelId) ? ctx.activeHostelId : hostels.length === 1 ? hostels[0]!.id : "";

  return (
    <>
      <PageHeader
        title={`Add ${t.resident.toLowerCase()}`}
        description={
          t.property === "Hostel"
            ? returnTo
              ? "Register the resident, then continue with the check-in."
              : "Register a resident. You can check them in to a bed right after."
            : returnTo
              ? `Register the ${t.resident.toLowerCase()}, then continue with the move-in.`
              : `Register a ${t.resident.toLowerCase()}. You can move them in right after.`
        }
        breadcrumbs={[
          { label: t.residents, href: "/residents" },
          ...(returnTo ? [{ label: t.checkIn, href: "/residents/check-in" }] : []),
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
