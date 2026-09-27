import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { AnnouncementAudience } from "@/generated/prisma/enums";
import { audit, recordAudit } from "@/lib/audit";
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  actorOf,
  assertHostelAccess,
  can,
  requireAnyPermission,
  requirePermission,
  type TenantContext,
} from "@/lib/tenant/context";
import type { ResidentContext } from "@/lib/tenant/resident";
import {
  announcementFiltersSchema,
  announcementSchema,
  type AnnouncementFilters,
  type AnnouncementInput,
} from "@/lib/validation/operations";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import { serialize } from "@/lib/serialize";
import { todayInTimeZone } from "@/lib/format";
import { notifyMembers, notifyUsers, type NotificationPayload } from "@/lib/notifications/notify";
import { dayInZone, endOfDayInZone, startOfDayInZone } from "./shared";

const ENTITY = "Announcement";
const NOTIFIED_ACTION = "announcement.notified";
const STAFF_AUDIENCES: AnnouncementAudience[] = ["EVERYONE", "STAFF"];
const RESIDENT_AUDIENCES: AnnouncementAudience[] = ["EVERYONE", "RESIDENTS"];

const include = {
  hostel: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { recipients: true } },
} satisfies Prisma.AnnouncementInclude;

// ─── Scope ──────────────────────────────────────────────────────────────────

/** Organization-wide announcements plus those for hostels the member can see (honours the switcher). */
function hostelVisibility(ctx: TenantContext): Prisma.AnnouncementWhereInput {
  if (ctx.activeHostelId) return { OR: [{ hostelId: null }, { hostelId: ctx.activeHostelId }] };
  if (ctx.allHostels) return {};
  return { OR: [{ hostelId: null }, { hostelId: { in: ctx.accessibleHostelIds } }] };
}

function activeWhere(now = new Date()): Prisma.AnnouncementWhereInput {
  return { archivedAt: null, publishedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

/** Publishers see every announcement in scope; view-only members see live staff-facing ones. */
function listScope(ctx: TenantContext): Prisma.AnnouncementWhereInput {
  requirePermission(ctx, "announcements.view");
  const base: Prisma.AnnouncementWhereInput = { AND: [{ organizationId: ctx.organizationId }, hostelVisibility(ctx)] };
  if (can(ctx, "announcements.manage")) return base;
  return { AND: [base, activeWhere(), { audience: { in: STAFF_AUDIENCES } }] };
}

function canManageTarget(ctx: TenantContext, hostelId: string | null) {
  if (!can(ctx, "announcements.manage")) return false;
  return hostelId === null ? ctx.allHostels : ctx.accessibleHostelIds.includes(hostelId);
}

function assertCanTarget(ctx: TenantContext, hostelId: string | null) {
  requirePermission(ctx, "announcements.manage");
  if (hostelId === null) {
    if (!ctx.allHostels) throw new ForbiddenError("Only members with access to every hostel can publish to the entire organization. Pick a hostel.");
    return;
  }
  assertHostelAccess(ctx, hostelId);
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function listAnnouncements(ctx: TenantContext, raw: AnnouncementFilters = {}) {
  const filters = parseInput(announcementFiltersSchema, raw);
  await dispatchDueAnnouncements(ctx.organizationId);
  const now = new Date();
  const state: Prisma.AnnouncementWhereInput =
    filters.state === "active"
      ? activeWhere(now)
      : filters.state === "scheduled"
        ? { archivedAt: null, publishedAt: { gt: now } }
        : filters.state === "expired"
          ? { archivedAt: null, expiresAt: { lte: now } }
          : filters.state === "archived"
            ? { archivedAt: { not: null } }
            : { archivedAt: null };
  const where: Prisma.AnnouncementWhereInput = {
    AND: [
      listScope(ctx),
      state,
      filters.category ? { category: filters.category } : {},
      filters.audience ? { audience: filters.audience } : {},
      filters.q
        ? { OR: [{ title: { contains: filters.q, mode: "insensitive" } }, { body: { contains: filters.q, mode: "insensitive" } }] }
        : {},
    ],
  };
  const { skip, take, page, pageSize } = paginate(filters);
  const [rows, total] = await Promise.all([
    prisma.announcement.findMany({ where, skip, take, orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }], include }),
    prisma.announcement.count({ where }),
  ]);
  const items = rows.map((a) => ({ ...a, canManage: canManageTarget(ctx, a.hostelId) }));
  return serialize(toPaginated(items, total, page, pageSize));
}

export async function getAnnouncementCounts(ctx: TenantContext) {
  const scope = listScope(ctx);
  const now = new Date();
  const [active, scheduled, pinned] = await Promise.all([
    prisma.announcement.count({ where: { AND: [scope, activeWhere(now)] } }),
    prisma.announcement.count({ where: { AND: [scope, { archivedAt: null, publishedAt: { gt: now } }] } }),
    prisma.announcement.count({ where: { AND: [scope, activeWhere(now), { isPinned: true }] } }),
  ]);
  return { active, scheduled, pinned };
}

export async function getAnnouncement(ctx: TenantContext, id: string) {
  const announcement = await prisma.announcement.findFirst({
    where: { AND: [{ id }, listScope(ctx)] },
    include: {
      ...include,
      recipients: {
        take: 500,
        select: { resident: { select: { id: true, firstName: true, lastName: true, residentCode: true, hostelId: true } } },
      },
    },
  });
  if (!announcement) throw new NotFoundError("Announcement");
  return serialize({ ...announcement, canManage: canManageTarget(ctx, announcement.hostelId) });
}

/** Live announcements addressed to staff (EVERYONE / STAFF) in the member's hostels — for My tasks. */
export async function listStaffAnnouncements(ctx: TenantContext, limit = 5) {
  requireAnyPermission(ctx, "announcements.view", "tasks.view");
  await dispatchDueAnnouncements(ctx.organizationId);
  const rows = await prisma.announcement.findMany({
    where: {
      AND: [
        { organizationId: ctx.organizationId, audience: { in: STAFF_AUDIENCES } },
        ctx.allHostels ? {} : { OR: [{ hostelId: null }, { hostelId: { in: ctx.accessibleHostelIds } }] },
        activeWhere(),
      ],
    },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
    take: Math.min(limit, 20),
    include,
  });
  return serialize(rows);
}

/** Live announcements a resident should see (for the resident portal). */
export async function listResidentAnnouncements(rctx: ResidentContext, limit = 20) {
  await dispatchDueAnnouncements(rctx.organizationId);
  const rows = await prisma.announcement.findMany({
    where: {
      AND: [
        { organizationId: rctx.organizationId },
        activeWhere(),
        {
          OR: [
            { audience: { in: RESIDENT_AUDIENCES }, OR: [{ hostelId: null }, { hostelId: rctx.hostelId }] },
            { audience: "SPECIFIC_RESIDENTS", recipients: { some: { residentId: rctx.residentId } } },
          ],
        },
      ],
    },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
    take: Math.min(limit, 50),
    select: { id: true, title: true, body: true, category: true, isPinned: true, publishedAt: true, expiresAt: true, hostel: { select: { name: true } } },
  });
  return rows;
}

// ─── Mutations ──────────────────────────────────────────────────────────────

type Parsed = ReturnType<typeof announcementSchema.parse>;

function resolveSchedule(ctx: TenantContext, input: Parsed, existing?: { publishedAt: Date }) {
  const tz = ctx.organization.timezone;
  const now = new Date();
  const today = todayInTimeZone(tz);
  let publishedAt: Date;
  if (!input.publishDate) publishedAt = existing?.publishedAt ?? now;
  else if (existing && dayInZone(existing.publishedAt, tz) === input.publishDate) publishedAt = existing.publishedAt;
  else if (input.publishDate <= today) publishedAt = now;
  else publishedAt = startOfDayInZone(input.publishDate, tz);

  const expiresAt = input.expiryDate ? endOfDayInZone(input.expiryDate, tz) : null;
  if (expiresAt && expiresAt <= now) {
    throw new ValidationError("Please check the highlighted fields.", { expiryDate: ["The expiry date has already passed."] });
  }
  if (expiresAt && expiresAt <= publishedAt) {
    throw new ValidationError("Please check the highlighted fields.", { expiryDate: ["Expiry must be after the publish date."] });
  }
  return { publishedAt, expiresAt };
}

async function resolveRecipients(ctx: TenantContext, input: Parsed, hostelId: string | null) {
  if (input.audience !== "SPECIFIC_RESIDENTS") return [];
  const residents = await prisma.resident.findMany({
    where: {
      id: { in: input.residentIds },
      organizationId: ctx.organizationId,
      archivedAt: null,
      ...(hostelId ? { hostelId } : ctx.allHostels ? {} : { hostelId: { in: ctx.accessibleHostelIds } }),
    },
    select: { id: true },
  });
  if (residents.length !== input.residentIds.length) {
    throw new ValidationError("Please check the highlighted fields.", {
      residentIds: [hostelId ? "Some selected residents don't belong to the target hostel." : "Some selected residents could not be found."],
    });
  }
  return residents.map((r) => r.id);
}

export async function createAnnouncement(ctx: TenantContext, raw: AnnouncementInput) {
  const input = parseInput(announcementSchema, raw);
  const hostelId = input.hostelId ?? null;
  assertCanTarget(ctx, hostelId);
  if (hostelId) await assertLiveHostel(ctx, hostelId);
  const schedule = resolveSchedule(ctx, input);
  const recipientIds = await resolveRecipients(ctx, input, hostelId);

  const announcement = await prisma.$transaction(async (tx) => {
    const created = await tx.announcement.create({
      data: {
        organizationId: ctx.organizationId,
        hostelId,
        title: input.title,
        body: input.body,
        category: input.category,
        audience: input.audience,
        isPinned: input.isPinned,
        publishedAt: schedule.publishedAt,
        expiresAt: schedule.expiresAt,
        createdById: ctx.userId,
      },
    });
    if (recipientIds.length) {
      await tx.announcementRecipient.createMany({ data: recipientIds.map((residentId) => ({ announcementId: created.id, residentId })) });
    }
    await audit(
      actorOf(ctx),
      {
        action: "announcement.created",
        entityType: ENTITY,
        entityId: created.id,
        after: { title: created.title, audience: created.audience, hostelId, category: created.category, publishedAt: created.publishedAt, expiresAt: created.expiresAt, recipients: recipientIds.length },
      },
      tx,
    );
    return created;
  });

  if (announcement.publishedAt <= new Date()) await dispatchAnnouncement(announcement.id, ctx.userId);
  return serialize(announcement);
}

async function assertLiveHostel(ctx: TenantContext, hostelId: string) {
  const hostel = await prisma.hostel.findFirst({ where: { id: hostelId, organizationId: ctx.organizationId, archivedAt: null }, select: { id: true } });
  if (!hostel) throw new NotFoundError("Hostel");
}

async function loadForWrite(ctx: TenantContext, id: string) {
  requirePermission(ctx, "announcements.manage");
  const existing = await prisma.announcement.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!existing) throw new NotFoundError("Announcement");
  // Hide records outside the member's hostels; forbid org-wide edits for hostel-scoped members.
  if (existing.hostelId && !ctx.accessibleHostelIds.includes(existing.hostelId)) throw new NotFoundError("Announcement");
  assertCanTarget(ctx, existing.hostelId);
  return existing;
}

export async function updateAnnouncement(ctx: TenantContext, id: string, raw: AnnouncementInput) {
  const input = parseInput(announcementSchema, raw);
  const before = await loadForWrite(ctx, id);
  if (before.archivedAt) throw new BusinessRuleError("Restore this announcement before editing it.");
  const hostelId = input.hostelId ?? null;
  assertCanTarget(ctx, hostelId);
  if (hostelId && hostelId !== before.hostelId) await assertLiveHostel(ctx, hostelId);
  const schedule = resolveSchedule(ctx, input, before);
  const recipientIds = await resolveRecipients(ctx, input, hostelId);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.announcement.update({
      where: { id },
      data: {
        hostelId,
        title: input.title,
        body: input.body,
        category: input.category,
        audience: input.audience,
        isPinned: input.isPinned,
        publishedAt: schedule.publishedAt,
        expiresAt: schedule.expiresAt,
      },
    });
    await tx.announcementRecipient.deleteMany({ where: { announcementId: id } });
    if (recipientIds.length) {
      await tx.announcementRecipient.createMany({ data: recipientIds.map((residentId) => ({ announcementId: id, residentId })) });
    }
    await audit(
      actorOf(ctx),
      {
        action: "announcement.updated",
        entityType: ENTITY,
        entityId: id,
        before: { title: before.title, audience: before.audience, hostelId: before.hostelId, isPinned: before.isPinned, publishedAt: before.publishedAt, expiresAt: before.expiresAt },
        after: { title: row.title, audience: row.audience, hostelId: row.hostelId, isPinned: row.isPinned, publishedAt: row.publishedAt, expiresAt: row.expiresAt, recipients: recipientIds.length },
      },
      tx,
    );
    return row;
  });

  // Rescheduled into the past/now and not yet sent → deliver now (dispatch is idempotent).
  if (updated.publishedAt <= new Date()) await dispatchAnnouncement(updated.id, ctx.userId);
  return serialize(updated);
}

export async function setAnnouncementPinned(ctx: TenantContext, id: string, pinned: boolean) {
  const before = await loadForWrite(ctx, id);
  if (before.archivedAt) throw new BusinessRuleError("Restore this announcement first.");
  if (before.isPinned === pinned) return serialize(before);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.announcement.update({ where: { id }, data: { isPinned: pinned } });
    await audit(actorOf(ctx), { action: pinned ? "announcement.pinned" : "announcement.unpinned", entityType: ENTITY, entityId: id }, tx);
    return row;
  });
  return serialize(updated);
}

export async function archiveAnnouncement(ctx: TenantContext, id: string) {
  const before = await loadForWrite(ctx, id);
  if (before.archivedAt) return;
  await prisma.$transaction(async (tx) => {
    await tx.announcement.update({ where: { id }, data: { archivedAt: new Date(), isPinned: false } });
    await audit(actorOf(ctx), { action: "announcement.archived", entityType: ENTITY, entityId: id }, tx);
  });
}

export async function restoreAnnouncement(ctx: TenantContext, id: string) {
  const before = await loadForWrite(ctx, id);
  if (!before.archivedAt) return;
  await prisma.$transaction(async (tx) => {
    await tx.announcement.update({ where: { id }, data: { archivedAt: null } });
    await audit(actorOf(ctx), { action: "announcement.restored", entityType: ENTITY, entityId: id }, tx);
  });
}

// ─── Delivery ───────────────────────────────────────────────────────────────

/**
 * Deliver an announcement to its audience once. A `announcement.notified`
 * audit row marks delivery so edits and scheduled re-checks never notify
 * twice. Channels (in-app, email, and later SMS/WhatsApp) are chosen by
 * `notifyUsers` from the organization's notification settings.
 */
async function dispatchAnnouncement(id: string, actorUserId: string | null) {
  try {
    const announcement = await prisma.announcement.findUnique({
      where: { id },
      select: { id: true, organizationId: true, hostelId: true, title: true, body: true, audience: true, category: true, publishedAt: true, expiresAt: true, archivedAt: true },
    });
    if (!announcement || announcement.archivedAt) return;
    const now = new Date();
    if (announcement.publishedAt > now || (announcement.expiresAt && announcement.expiresAt <= now)) return;
    const already = await prisma.auditLog.findFirst({
      where: { organizationId: announcement.organizationId, entityType: ENTITY, entityId: id, action: NOTIFIED_ACTION },
      select: { id: true },
    });
    if (already) return;

    const residentUserIds = await residentAudienceUserIds(announcement);
    const staffAudience = STAFF_AUDIENCES.includes(announcement.audience);
    await recordAudit({
      organizationId: announcement.organizationId,
      userId: actorUserId,
      action: NOTIFIED_ACTION,
      entityType: ENTITY,
      entityId: id,
      metadata: { residents: residentUserIds.length, staff: staffAudience },
    });

    const excerpt = announcement.body.length > 180 ? `${announcement.body.slice(0, 177)}…` : announcement.body;
    const payload: NotificationPayload = { type: "ANNOUNCEMENT", title: announcement.title, body: excerpt };
    const residentRecipients = residentUserIds.filter((u) => u !== actorUserId);
    if (residentRecipients.length) await notifyUsers(announcement.organizationId, residentRecipients, { ...payload, link: "/portal" });
    if (staffAudience) {
      await notifyMembers(
        announcement.organizationId,
        "announcements.view",
        announcement.hostelId,
        { ...payload, link: "/operations/announcements" },
        actorUserId ? { excludeUserId: actorUserId } : {},
      );
    }
  } catch (error) {
    console.error("[announcements] dispatch failed", error);
  }
}

async function residentAudienceUserIds(a: { id: string; organizationId: string; hostelId: string | null; audience: AnnouncementAudience }) {
  if (a.audience === "SPECIFIC_RESIDENTS") {
    const rows = await prisma.announcementRecipient.findMany({
      where: { announcementId: a.id, resident: { archivedAt: null, userId: { not: null } } },
      select: { resident: { select: { userId: true } } },
    });
    return rows.map((r) => r.resident.userId).filter((u): u is string => !!u);
  }
  if (!RESIDENT_AUDIENCES.includes(a.audience)) return [];
  const rows = await prisma.resident.findMany({
    where: {
      organizationId: a.organizationId,
      archivedAt: null,
      status: { in: ["ACTIVE", "NOTICE"] },
      userId: { not: null },
      ...(a.hostelId ? { hostelId: a.hostelId } : {}),
    },
    select: { userId: true },
  });
  return rows.map((r) => r.userId).filter((u): u is string => !!u);
}

/**
 * Deliver scheduled announcements whose publish time has arrived. Called
 * opportunistically whenever announcements are read, and safe to call from a
 * cron job. Only looks back 14 days so stale items are never blasted out.
 */
export async function dispatchDueAnnouncements(organizationId: string) {
  try {
    const now = new Date();
    const due = await prisma.announcement.findMany({
      where: {
        organizationId,
        archivedAt: null,
        publishedAt: { lte: now, gte: new Date(now.getTime() - 14 * 86400_000) },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true },
      orderBy: { publishedAt: "asc" },
      take: 50,
    });
    if (due.length === 0) return;
    const sent = await prisma.auditLog.findMany({
      where: { organizationId, entityType: ENTITY, action: NOTIFIED_ACTION, entityId: { in: due.map((d) => d.id) } },
      select: { entityId: true },
    });
    const sentIds = new Set(sent.map((s) => s.entityId));
    for (const a of due) {
      if (!sentIds.has(a.id)) await dispatchAnnouncement(a.id, null);
    }
  } catch (error) {
    console.error("[announcements] scheduled dispatch failed", error);
  }
}
