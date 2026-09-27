import "server-only";
import { redirect } from "next/navigation";
import type { Permission } from "@/lib/permissions/catalog";
import { can } from "@/lib/tenant/context";
import { requireTenantPage } from "@/lib/tenant/server";

/**
 * Page guard for settings sections. Members without the section permission
 * are sent back to /settings, which forwards them to a section they can open
 * (Security is available to everyone, so this never loops).
 */
export async function requireSettingsPage(permission: Permission | null) {
  const ctx = await requireTenantPage();
  if (permission && !can(ctx, permission)) redirect("/settings");
  return ctx;
}
