import { redirect } from "next/navigation";
import { requireTenantPage, homePathFor } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";

/** /operations → the first operations screen this member can open. */
export default async function OperationsIndexPage() {
  const ctx = await requireTenantPage();
  if (can(ctx, "maintenance.view") || can(ctx, "maintenance.work")) redirect("/operations/maintenance");
  if (can(ctx, "complaints.view")) redirect("/operations/complaints");
  if (can(ctx, "visitors.view")) redirect("/operations/visitors");
  if (can(ctx, "announcements.view")) redirect("/operations/announcements");
  redirect(homePathFor(ctx));
}
