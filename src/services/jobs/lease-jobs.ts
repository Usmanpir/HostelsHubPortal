import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit";
import { notifyMembers, notifyResident } from "@/lib/notifications/notify";
import { formatDate, formatMoney, fullName } from "@/lib/format";
import { round2, toNumber } from "@/lib/serialize";
import { addMonthsUtc, placementLabel } from "@/services/resident/shared";
import { DEFAULT_INCREMENT_INTERVAL_MONTHS, SCHEDULED_RENT_CHANGE_ACTION } from "@/services/resident/assignment-service";

/** Days before `leaseEndDate` on which expiry reminders go out. */
export const LEASE_REMINDER_DAYS = [30, 7] as const;

type OrgInfo = { id: string; currency: string; locale: string };

const DAY = 86400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

const leaseInclude = {
  resident: { select: { id: true, firstName: true, lastName: true } },
  hostel: { select: { id: true, name: true, rentalMode: true } },
  room: { select: { roomNumber: true } },
  bed: { select: { bedNumber: true } },
} as const;

/**
 * Apply due automatic rent increments: ACTIVE leases whose nextIncrementDate
 * is today or earlier get monthlyRent × (1 + pct/100) and the next date moves
 * forward one interval. Catches up missed intervals one step per run (the
 * `nextIncrementDate` guard makes re-runs on the same day a no-op).
 */
export async function applyRentIncrements(org: OrgInfo, today: Date) {
  const due = await prisma.residentAssignment.findMany({
    where: {
      organizationId: org.id,
      status: "ACTIVE",
      nextIncrementDate: { lte: today },
      rentIncrementPercent: { gt: 0 },
    },
    include: leaseInclude,
    take: 5000,
  });
  let applied = 0;
  for (const a of due) {
    const pct = toNumber(a.rentIncrementPercent);
    const interval = a.incrementIntervalMonths ?? DEFAULT_INCREMENT_INTERVAL_MONTHS;
    const beforeRent = toNumber(a.monthlyRent);
    const afterRent = round2(beforeRent * (1 + pct / 100));
    const next = addMonthsUtc(a.nextIncrementDate!, interval);
    const changed = await prisma.$transaction(async (tx) => {
      // Conditional update: only the run that still sees the old date applies it.
      const res = await tx.residentAssignment.updateMany({
        where: { id: a.id, status: "ACTIVE", nextIncrementDate: a.nextIncrementDate },
        data: { monthlyRent: afterRent, nextIncrementDate: next },
      });
      if (res.count === 0) return false;
      await recordAudit(
        {
          organizationId: org.id,
          action: "lease.rent_increased",
          entityType: "ResidentAssignment",
          entityId: a.id,
          before: { monthlyRent: beforeRent, nextIncrementDate: a.nextIncrementDate },
          after: { monthlyRent: afterRent, nextIncrementDate: next },
          metadata: { residentId: a.residentId, percent: pct, automatic: true },
        },
        tx,
      );
      return true;
    });
    if (!changed) continue;
    applied++;
    const money = (n: number) => formatMoney(n, org.currency, org.locale);
    const where = `${a.hostel.name} · ${placementLabel(a)}`;
    await notifyResident(org.id, a.residentId, {
      type: "RENT_INCREASED",
      title: `Your rent is now ${money(afterRent)}`,
      body: `${where}: rent increased by ${pct}% (from ${money(beforeRent)}) as per your lease.`,
      link: "/portal",
    });
    await notifyMembers(org.id, "residents.view", a.hostelId, {
      type: "RENT_INCREASED",
      title: `Rent increased for ${fullName(a.resident)}`,
      body: `${where}: ${money(beforeRent)} → ${money(afterRent)} (+${pct}%)`,
      link: `/residents/${a.residentId}`,
    });
  }
  return applied;
}

/** Apply rent changes scheduled by a lease renewal once their effective date arrives. */
export async function applyScheduledRentChanges(org: OrgInfo, today: Date) {
  const scheduled = await prisma.auditLog.findMany({
    where: { organizationId: org.id, action: SCHEDULED_RENT_CHANGE_ACTION, createdAt: { gte: new Date(today.getTime() - 800 * DAY) } },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const seen = new Set<string>();
  let applied = 0;
  for (const s of scheduled) {
    if (!s.entityId || seen.has(s.entityId)) continue;
    seen.add(s.entityId); // only the latest schedule per lease counts
    const meta = (s.metadata ?? {}) as { newMonthlyRent?: number; effectiveDate?: string };
    if (!meta.newMonthlyRent || !meta.effectiveDate || meta.effectiveDate > iso(today)) continue;
    const done = await prisma.auditLog.findFirst({
      where: { organizationId: org.id, action: "lease.rent_changed", entityId: s.entityId, createdAt: { gte: s.createdAt } },
      select: { id: true },
    });
    if (done) continue;
    const a = await prisma.residentAssignment.findFirst({
      where: { id: s.entityId, organizationId: org.id, status: "ACTIVE" },
      include: leaseInclude,
    });
    if (!a) continue;
    const beforeRent = toNumber(a.monthlyRent);
    const afterRent = round2(meta.newMonthlyRent);
    await prisma.$transaction(async (tx) => {
      await tx.residentAssignment.update({ where: { id: a.id }, data: { monthlyRent: afterRent } });
      await recordAudit(
        {
          organizationId: org.id,
          action: "lease.rent_changed",
          entityType: "ResidentAssignment",
          entityId: a.id,
          before: { monthlyRent: beforeRent },
          after: { monthlyRent: afterRent },
          metadata: { residentId: a.residentId, scheduleId: s.id, effectiveDate: meta.effectiveDate },
        },
        tx,
      );
    });
    applied++;
    await notifyResident(org.id, a.residentId, {
      type: "RENT_INCREASED",
      title: `Your rent is now ${formatMoney(afterRent, org.currency, org.locale)}`,
      body: `${a.hostel.name} · ${placementLabel(a)}: new rent from ${formatDate(meta.effectiveDate)} as per your renewed lease.`,
      link: "/portal",
    });
  }
  return applied;
}

/**
 * LEASE_EXPIRING reminders 30 and 7 days before leaseEndDate to members with
 * residents.manage and to the tenant. Idempotent per lease per threshold: an
 * AuditLog marker (`lease.expiry_reminder` with the threshold) is written once.
 */
export async function sendLeaseExpiryReminders(org: OrgInfo, today: Date) {
  let sent = 0;
  for (const days of LEASE_REMINDER_DAYS) {
    // A 3-day window so a missed cron run still sends the reminder (the marker prevents repeats).
    const leases = await prisma.residentAssignment.findMany({
      where: {
        organizationId: org.id,
        status: "ACTIVE",
        leaseEndDate: { gte: new Date(today.getTime() + (days - 2) * DAY), lte: new Date(today.getTime() + days * DAY) },
      },
      include: leaseInclude,
      take: 5000,
    });
    for (const a of leases) {
      const marker = `${iso(a.leaseEndDate!)}:${days}`;
      const already = await prisma.auditLog.findFirst({
        where: {
          organizationId: org.id,
          action: "lease.expiry_reminder",
          entityId: a.id,
          metadata: { path: ["marker"], equals: marker },
        },
        select: { id: true },
      });
      if (already) continue;
      await recordAudit({
        organizationId: org.id,
        action: "lease.expiry_reminder",
        entityType: "ResidentAssignment",
        entityId: a.id,
        metadata: { marker, daysBefore: days, leaseEndDate: iso(a.leaseEndDate!) },
      });
      const where = `${a.hostel.name} · ${placementLabel(a)}`;
      const when = formatDate(a.leaseEndDate, org.locale);
      const left = Math.round((a.leaseEndDate!.getTime() - today.getTime()) / DAY);
      await notifyMembers(org.id, "residents.manage", a.hostelId, {
        type: "LEASE_EXPIRING",
        title: `Lease for ${fullName(a.resident)} ends in ${left} days`,
        body: `${where} — ends ${when}. Renew it or plan the move-out.`,
        link: `/residents/${a.residentId}`,
      });
      await notifyResident(org.id, a.residentId, {
        type: "LEASE_EXPIRING",
        title: `Your lease ends in ${left} days`,
        body: `${where} — ends ${when}. Contact the office to renew.`,
        link: "/portal",
      });
      sent++;
    }
  }
  return sent;
}

/** All lease jobs for one organization (called from runDailyJobs). */
export async function runLeaseJobs(org: OrgInfo, today: Date) {
  const rentChanges = await applyScheduledRentChanges(org, today);
  const rentIncrements = await applyRentIncrements(org, today);
  const leaseReminders = await sendLeaseExpiryReminders(org, today);
  return { rentChanges, rentIncrements, leaseReminders };
}
