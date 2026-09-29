import "server-only";
import { prisma } from "@/lib/db/prisma";
import { markOverdueInvoices } from "@/services/finance/ledger";
import { dispatchDueAnnouncements } from "@/services/operations/announcement-service";
import { notifyUsers } from "@/lib/notifications/notify";
import { dateOnly, formatMoney, todayInTimeZone } from "@/lib/format";
import { round2, toNumber } from "@/lib/serialize";
import { reconcileOnlinePayments } from "@/services/payments/online-payment-service";
import { runLeaseJobs } from "./lease-jobs";

const REMINDER_DAYS_BEFORE_DUE = 3;

/**
 * Daily maintenance run (triggered by /api/cron/daily):
 *  1. flip unpaid invoices past their due date to OVERDUE, per org timezone
 *  2. send RENT_DUE reminders to residents with portal accounts for invoices
 *     due in exactly N days (idempotent per invoice per day via the link key)
 *  3. purge expired rate-limit buckets
 *  4. re-check stale PENDING online payments with the gateway and expire abandoned ones
 *  5. leases: apply scheduled rent changes and due automatic increments, and send
 *     LEASE_EXPIRING reminders 30 / 7 days before the lease end (see lease-jobs.ts)
 */
export async function runDailyJobs() {
  const orgs = await prisma.organization.findMany({
    where: { status: "ACTIVE", deletedAt: null },
    select: { id: true, timezone: true, currency: true, locale: true },
  });
  let reminders = 0;
  const leases = { rentChanges: 0, rentIncrements: 0, leaseReminders: 0 };
  for (const org of orgs) {
    await markOverdueInvoices(org.id, org.timezone);
    await dispatchDueAnnouncements(org.id);
    const today = dateOnly(todayInTimeZone(org.timezone));
    const dueOn = new Date(today.getTime() + REMINDER_DAYS_BEFORE_DUE * 86400_000);
    const invoices = await prisma.invoice.findMany({
      where: { organizationId: org.id, status: { in: ["PENDING", "PARTIALLY_PAID"] }, dueDate: dueOn, resident: { userId: { not: null } } },
      select: { id: true, invoiceNumber: true, total: true, amountPaid: true, resident: { select: { userId: true } } },
      take: 5000,
    });
    for (const inv of invoices) {
      const link = `/portal/invoices/${inv.id}`;
      const already = await prisma.notification.findFirst({
        where: { organizationId: org.id, userId: inv.resident.userId!, type: "RENT_DUE", link, createdAt: { gte: today } },
        select: { id: true },
      });
      if (already) continue;
      const balance = round2(toNumber(inv.total) - toNumber(inv.amountPaid));
      await notifyUsers(org.id, [inv.resident.userId!], {
        type: "RENT_DUE",
        title: `Rent due in ${REMINDER_DAYS_BEFORE_DUE} days`,
        body: `Invoice ${inv.invoiceNumber}: ${formatMoney(balance, org.currency, org.locale)} due on ${dueOn.toISOString().slice(0, 10)}.`,
        link,
      });
      reminders++;
    }
    try {
      const r = await runLeaseJobs(org, today);
      leases.rentChanges += r.rentChanges;
      leases.rentIncrements += r.rentIncrements;
      leases.leaseReminders += r.leaseReminders;
    } catch (error) {
      // One organization's lease data must not stop the run for everyone else.
      console.error("[daily-jobs] lease jobs failed", org.id, error);
    }
  }
  const purged = await prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const onlinePayments = await reconcileOnlinePayments();
  return { organizations: orgs.length, reminders, rateLimitBucketsPurged: purged.count, onlinePayments, leases };
}
