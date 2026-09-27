import "server-only";
import type { ResidentContext } from "@/lib/tenant/resident";
import { serialize } from "@/lib/serialize";
import { latestPortalAnnouncements } from "./announcement-service";
import { getPortalBalance, nextDueInvoice, recentPortalPayments } from "./billing-service";
import { openPortalComplaints } from "./complaint-service";
import { openPortalMaintenance } from "./maintenance-service";
import { currentAssignment, loadSelf } from "./shared";
import { markOverdueInvoices } from "@/services/finance/ledger";

export async function getPortalDashboard(ctx: ResidentContext) {
  await markOverdueInvoices(ctx.organizationId, ctx.organization.timezone);
  const [self, assignment, balance, nextDue, payments, maintenance, complaints, announcements] = await Promise.all([
    loadSelf(ctx),
    currentAssignment(ctx),
    getPortalBalance(ctx),
    nextDueInvoice(ctx),
    recentPortalPayments(ctx),
    openPortalMaintenance(ctx),
    openPortalComplaints(ctx),
    latestPortalAnnouncements(ctx),
  ]);
  return {
    resident: self,
    assignment: serialize(assignment),
    balance,
    nextDue,
    payments,
    maintenance,
    complaints,
    announcements,
  };
}
