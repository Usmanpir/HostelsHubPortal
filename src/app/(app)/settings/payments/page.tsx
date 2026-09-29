import { FlaskConical, ShieldCheck } from "lucide-react";
import { SectionHeader } from "@/components/settings/section-header";
import { PaymentGatewayCard } from "@/components/settings/payment-gateway-card";
import { formatDateTime } from "@/lib/format";
import { getGatewaySettings } from "@/services/payments/gateway-config-service";
import { requireSettingsPage } from "../guard";

export const metadata = { title: "Online payments" };

export default async function PaymentSettingsPage() {
  const ctx = await requireSettingsPage("settings.organization");
  const settings = await getGatewaySettings(ctx);

  return (
    <>
      <SectionHeader
        title="Online payments"
        description="Connect your own JazzCash and Easypaisa merchant accounts so residents can pay rent from the resident portal. Money goes straight to your merchant account."
      />
      <div className="flex flex-col gap-4">
        {settings.currency !== "PKR" ? (
          <p className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
            JazzCash and Easypaisa only accept PKR. Your organization currency is {settings.currency}, so online payments can&apos;t be enabled.
          </p>
        ) : null}
        {settings.simulator ? (
          <p className="flex items-start gap-2 rounded-xl border border-info/30 bg-info-soft px-4 py-3 text-sm text-info">
            <FlaskConical className="mt-0.5 size-4 shrink-0" />
            The development payment simulator is on (PAYMENTS_SIMULATOR=true). Residents also see a “Test payment” option. It is never available in production.
          </p>
        ) : null}
        {settings.gateways.map((g) => (
          <PaymentGatewayCard
            key={g.provider}
            gateway={g}
            currency={settings.currency}
            lastTestedLabel={g.lastTestedAt ? formatDateTime(g.lastTestedAt, ctx.organization.timezone, ctx.organization.locale) : null}
          />
        ))}
        <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
          Credentials are encrypted at rest and never shown again after saving. Every payment is confirmed with the gateway (signature or status
          check) before it&apos;s recorded, and appears under Finance → Payments as an online payment.
        </p>
      </div>
    </>
  );
}
