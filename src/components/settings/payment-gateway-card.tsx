"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { Check, Copy, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FormGrid, SelectField, SwitchField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProviderMark, ProviderWordmark } from "@/components/payments/provider-mark";
import { gatewayEnvironmentLabels } from "@/config/payment-labels";
import { optionsFrom } from "@/config/labels";
import { gatewayConfigSchema, type ConfigurableProvider } from "@/lib/validation/payments";
import { saveGatewayConfigAction, testGatewayConnectionAction } from "@/app/(app)/settings/actions";
import { SettingsPanel } from "./section-header";

export type GatewayCardData = {
  provider: ConfigurableProvider;
  label: string;
  merchantIdLabel: string;
  subMerchantIdLabel: string | null;
  subMerchantIdRequired: boolean;
  enabled: boolean;
  environment: "SANDBOX" | "LIVE";
  merchantId: string;
  subMerchantId: string;
  secretFields: { key: string; label: string; help?: string; required: boolean; saved: boolean }[];
  configured: boolean;
  returnUrl: string;
  ipnUrl: string;
  lastTestedAt: string | Date | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
};

const SETUP_STEPS: Record<ConfigurableProvider, React.ReactNode[]> = {
  JAZZCASH: [
    <>Sign in to the JazzCash merchant portal (sandbox: sandbox.jazzcash.com.pk) and open your integration credentials.</>,
    <>Copy the Merchant ID, Password and Integrity Salt below.</>,
    <>Register the return URL below as your “Return URL” — JazzCash rejects checkouts whose return URL doesn’t match.</>,
    <>Test in Sandbox first, then switch to Live with your production credentials.</>,
  ],
  EASYPAISA: [
    <>In the Easypay merchant portal, go to Account Settings → Generate Hash Key and copy the 16-character key.</>,
    <>Ask Easypaisa for your Store ID, account number and web-service (API) username/password — they are used to confirm every payment server-side.</>,
    <>Add the return URL below as the post-back URL, and the IPN URL under Account Settings → IPN Attribute Configurations.</>,
    <>Test in Sandbox (easypaystg.easypaisa.com.pk) first, then switch to Live.</>,
  ],
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <code className="min-w-0 flex-1 font-mono text-xs break-all" title={value}>
          {value}
        </code>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              toast.error("Couldn't copy — select the text and copy it manually.");
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}

export function PaymentGatewayCard({ gateway, currency, lastTestedLabel }: { gateway: GatewayCardData; currency: string; lastTestedLabel: string | null }) {
  const router = useRouter();
  const [testing, startTest] = useTransition();
  const { form, onSubmit, pending } = useActionForm({
    schema: gatewayConfigSchema,
    defaultValues: {
      provider: gateway.provider,
      enabled: gateway.enabled,
      environment: gateway.environment,
      merchantId: gateway.merchantId,
      subMerchantId: gateway.subMerchantId,
      secrets: Object.fromEntries(gateway.secretFields.map((f) => [f.key, ""])),
      clearSecrets: [],
    },
    action: (values) => saveGatewayConfigAction(values),
    onSuccess: () => {
      // Secrets are write-only: clear what was typed, keep the rest.
      form.reset({ ...form.getValues(), secrets: Object.fromEntries(gateway.secretFields.map((f) => [f.key, ""])) });
      router.refresh();
    },
  });
  const c = form.control;
  const [enabled, environment] = useWatch({ control: c, name: ["enabled", "environment"] });
  const pkrOnly = currency !== "PKR";

  const status = gateway.enabled ? (
    <StatusBadge tone="success">Enabled</StatusBadge>
  ) : gateway.configured ? (
    <StatusBadge tone="neutral">Configured · off</StatusBadge>
  ) : (
    <StatusBadge tone="neutral">Not set up</StatusBadge>
  );

  const onTest = () =>
    startTest(async () => {
      try {
        const result = await testGatewayConnectionAction(gateway.provider);
        if (!result.ok) toast.error(result.error);
        else if (result.data.ok) toast.success(result.data.message);
        else toast.error(result.data.message);
        router.refresh();
      } catch {
        toast.error("Could not reach the server. Check your connection and try again.");
      }
    });

  return (
    <SettingsPanel
      title={gateway.label}
      description={gateway.provider === "JAZZCASH" ? "Mobile wallet, debit/credit card and voucher payments." : "Easypaisa mobile account and card payments."}
      actions={
        <div className="flex items-center gap-2">
          <ProviderMark provider={gateway.provider} size="sm" />
          {status}
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <SwitchField
            control={c}
            name="enabled"
            label={
              <span className="flex items-center gap-1.5">
                Accept payments with <ProviderWordmark provider={gateway.provider} />
              </span>
            }
            description={pkrOnly ? "Available only when your organization currency is PKR." : "Residents see a “Pay online” button on unpaid invoices."}
            disabled={pkrOnly && !gateway.enabled}
          />
          <FormGrid>
            <SelectField
              control={c}
              name="environment"
              label="Environment"
              options={optionsFrom(gatewayEnvironmentLabels)}
              description={environment === "LIVE" ? "Real money. Use your production credentials." : "Test transactions only."}
            />
            <TextField control={c} name="merchantId" label={gateway.merchantIdLabel} required autoComplete="off" />
            {gateway.subMerchantIdLabel ? (
              <TextField control={c} name="subMerchantId" label={gateway.subMerchantIdLabel} required={gateway.subMerchantIdRequired} autoComplete="off" />
            ) : null}
          </FormGrid>
          <FormGrid>
            {gateway.secretFields.map((f) => (
              <TextField
                key={f.key}
                control={c}
                name={`secrets.${f.key}`}
                label={
                  <span className="flex items-center gap-2">
                    {f.label}
                    {f.saved ? (
                      <StatusBadge tone="success" dot={false}>
                        Saved
                      </StatusBadge>
                    ) : null}
                  </span>
                }
                required={f.required && !f.saved}
                type="password"
                autoComplete="new-password"
                placeholder={f.saved ? "•••••••• (leave blank to keep)" : undefined}
                description={f.help}
              />
            ))}
          </FormGrid>
          {enabled && environment === "LIVE" ? (
            <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
              Live mode charges residents real money. Make sure a sandbox payment completed end-to-end first.
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onTest} disabled={testing || pending || !gateway.configured || form.formState.isDirty}>
              {testing ? <Spinner /> : <PlugZap />}
              Test connection
            </Button>
            <SubmitButton pending={pending}>Save {gateway.label}</SubmitButton>
          </div>
          {gateway.lastTestedAt ? (
            <p className={gateway.lastTestOk ? "text-xs text-success" : "text-xs text-danger"}>
              Last test{lastTestedLabel ? ` (${lastTestedLabel})` : ""}: {gateway.lastTestMessage}
            </p>
          ) : null}
        </form>

        <aside className="flex flex-col gap-3 rounded-lg border bg-background p-4 text-sm">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Setup</p>
          <ol className="grid list-decimal gap-2 ps-4 text-muted-foreground">
            {SETUP_STEPS[gateway.provider].map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <CopyField label="Return URL" value={gateway.returnUrl} />
          {gateway.provider === "EASYPAISA" ? <CopyField label="IPN URL" value={gateway.ipnUrl} /> : null}
        </aside>
      </div>
    </SettingsPanel>
  );
}
