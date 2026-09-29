"use client";

import { useEffect, useRef } from "react";
import { Spinner } from "@/components/ui/spinner";

export type GatewayForm = { actionUrl: string; method: "POST" | "GET"; fields: Record<string, string> };

/**
 * Hidden form that sends the browser to the gateway's hosted checkout. It
 * submits itself once mounted; the visible button is a fallback if scripts
 * are slow or the submit is blocked.
 */
export function GatewayRedirectForm({ form, label }: { form: GatewayForm; label: string }) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.submit();
  }, [form]);

  return (
    <form ref={ref} action={form.actionUrl} method={form.method} className="flex flex-col items-center gap-3 py-4 text-center">
      {Object.entries(form.fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Spinner className="size-6" />
      <p className="text-sm text-muted-foreground">Taking you to {label}…</p>
      <button type="submit" className="text-sm font-medium text-primary hover:underline">
        Not redirected? Continue to {label}
      </button>
    </form>
  );
}
