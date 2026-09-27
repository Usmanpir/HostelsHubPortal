import "server-only";
import { prisma } from "@/lib/db/prisma";
import { markOverdueInvoices } from "@/services/finance/ledger";
import { dispatchDueAnnouncements } from "@/services/operations/announcement-service";
import { notifyUsers } from "@/lib/notifications/notify";
import { dateOnly, formatMoney, todayInTimeZone } from "@/lib/format";
import { round2, toNumber } from "@/lib/serialize";

const REMINDER_DAYS_BEFORE_DUE = 3;

/**
 * Daily maintenance run (triggered by /api/cron/daily):
 *  1. flip unpaid invoices past their due date to OVERDUE, per org timezone
 *  2. send RENT_DUE reminders to residents with portal accounts for invoices
 *     due in exactly N days (idempotent per invoice per day via the link key)
 *  3. purge expired rate-limit buckets
 */
export async function runDailyJobs() {
  const orgs = await prisma.organization.findMany({
    where: { status: "ACTIVE", deletedAt: null },
    select: { id: true, timezone: true, currency: true, locale: true },
  });
  let reminders = 0;
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
  }
  const purged = await prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return { organizations: orgs.length, reminders, rateLimitBucketsPurged: purged.count };
}
