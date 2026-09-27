import { redirect } from "next/navigation";
import { allowedSettingsSections } from "@/components/settings/sections";
import { requireTenantPage } from "@/lib/tenant/server";

/** /settings → the first section this member may open (Security is always available). */
export default async function SettingsIndexPage() {
  const ctx = await requireTenantPage();
  const [first] = allowedSettingsSections(ctx.permissions);
  redirect(first?.href ?? "/settings/security");
}
