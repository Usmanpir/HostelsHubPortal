import { PageHeader } from "@/components/shared/page-header";
import { InvoiceForm } from "@/components/finance/invoice-form";
import { requireTenantPage } from "@/lib/tenant/server";
import { sp } from "@/lib/page-helpers";
import { NotFoundError } from "@/lib/errors";
import { getInvoiceFormDefaults } from "@/services/finance/invoice-service";
import { getResidentBillingContext } from "@/services/finance/billing-residents";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: PageProps<"/finance/invoices/new">) {
  const ctx = await requireTenantPage("invoices.manage");
  const params = await searchParams;
  const residentId = sp(params, "residentId");
  const [defaults, billing] = await Promise.all([
    getInvoiceFormDefaults(ctx),
    residentId
      ? getResidentBillingContext(ctx, residentId).catch((error: unknown) => {
          // An unknown or out-of-scope resident simply isn't prefilled.
          if (error instanceof NotFoundError) return null;
          throw error;
        })
      : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title="New invoice"
        description="Bill a resident for rent, deposits, utilities or other charges."
        breadcrumbs={[{ label: "Invoices", href: "/finance/invoices" }, { label: "New invoice" }]}
      />
      <InvoiceForm
        taxRate={defaults.taxRate}
        taxLabel={defaults.taxLabel}
        invoiceDueDays={defaults.invoiceDueDays}
        today={defaults.today}
        initialResident={
          billing ? { id: billing.resident.id, name: billing.resident.name, code: billing.resident.code, hostelName: billing.resident.hostel.name } : null
        }
      />
    </>
  );
}
