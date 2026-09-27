import { SectionHeader } from "@/components/settings/section-header";
import { InvoiceSettingsForm } from "@/components/settings/invoice-settings-form";
import { getOrganizationSettings } from "@/services/organization/settings-service";
import { requireSettingsPage } from "../guard";

export const metadata = { title: "Invoices" };

export default async function InvoiceSettingsPage() {
  const ctx = await requireSettingsPage("settings.organization");
  const { invoice } = await getOrganizationSettings(ctx);
  return (
    <>
      <SectionHeader
        title="Invoice settings"
        description="Defaults applied to new invoices and receipts. Existing documents keep their numbers and totals."
      />
      <InvoiceSettingsForm
        initial={{
          invoicePrefix: invoice.invoicePrefix,
          receiptPrefix: invoice.receiptPrefix,
          invoiceDueDays: invoice.invoiceDueDays,
          taxRate: invoice.taxRate,
          taxLabel: invoice.taxLabel ?? "",
          invoiceFooter: invoice.invoiceFooter ?? "",
        }}
      />
    </>
  );
}
