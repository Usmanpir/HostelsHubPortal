import { prisma, type DbClient } from "@/lib/db/prisma";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import type { Permission } from "@/lib/permissions/catalog";
import { assertHostelAccess, type TenantContext } from "@/lib/tenant/context";
import { dateOnly, todayInTimeZone } from "@/lib/format";
import { zonedTimeToUtc } from "@/lib/validation/real-estate";

/** Members holding any of these may be assigned as the agent on listings, leads, viewings and deals. */
export const AGENT_PERMISSIONS: Permission[] = ["listings.manage", "leads.manage", "deals.manage"];

export const DEALER_DISABLED_MESSAGE =
  "Sales & leasing is turned off for this organization. Enable it in Settings → Business & modules.";

/** Every real-estate service call refuses to run while the module is disabled. */
export function assertDealerEnabled(ctx: TenantContext) {
  if (!ctx.organization.dealerEnabled) throw new BusinessRuleError(DEALER_DISABLED_MESSAGE);
}

export function isDealerEnabled(ctx: TenantContext) {
  return ctx.organization.dealerEnabled;
}

/** An active member of this organization who can act as an agent. */
export async function assertAgentMember(
  ctx: TenantContext,
  userId: string,
  field = "agentUserId",
  db: DbClient = prisma,
) {
  const member = await db.organizationMember.findFirst({
    where: {
      organizationId: ctx.organizationId,
      userId,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      role: { permissions: { some: { permission: { in: AGENT_PERMISSIONS } } } },
    },
    select: { userId: true, user: { select: { name: true } } },
  });
  if (!member) {
    throw new ValidationError("Please check the highlighted fields.", {
      [field]: ["Pick a team member who works on listings, leads or deals."],
    });
  }
  return { id: member.userId, name: member.user.name };
}

/** Team members who can be picked as an agent. */
export async function listAgentOptions(ctx: TenantContext) {
  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      role: { permissions: { some: { permission: { in: AGENT_PERMISSIONS } } } },
    },
    orderBy: { user: { name: "asc" } },
    select: { userId: true, user: { select: { name: true, email: true } } },
  });
  return members.map((m) => ({ id: m.userId, name: m.user.name, email: m.user.email }));
}

/** A non-archived property owner of this organization. */
export async function assertOwnerInOrg(ctx: TenantContext, ownerId: string, db: DbClient = prisma) {
  const owner = await db.propertyOwner.findFirst({
    where: { id: ownerId, organizationId: ctx.organizationId, archivedAt: null },
    select: { id: true, name: true },
  });
  if (!owner) throw new NotFoundError("Owner");
  return owner;
}

/**
 * A managed property (and optional unit) the member can access. Throws
 * NotFound for other tenants' ids so their existence is not revealed.
 */
export async function assertManagedUnit(
  ctx: TenantContext,
  hostelId: string,
  roomId: string | undefined,
  db: DbClient = prisma,
) {
  assertHostelAccess(ctx, hostelId);
  const hostel = await db.hostel.findFirst({
    where: { id: hostelId, organizationId: ctx.organizationId },
    select: { id: true, name: true },
  });
  if (!hostel) throw new NotFoundError("Property");
  if (!roomId) return { hostel, room: null };
  const room = await db.room.findFirst({
    where: { id: roomId, organizationId: ctx.organizationId, hostelId, archivedAt: null },
    select: { id: true, roomNumber: true },
  });
  if (!room) {
    throw new ValidationError("Please check the highlighted fields.", { roomId: ["This unit is not part of the selected property."] });
  }
  return { hostel, room };
}

// ─── Dates in the organization's time zone ──────────────────────────────────

export function orgToday(ctx: TenantContext) {
  return todayInTimeZone(ctx.organization.timezone);
}

/** UTC instants bounding the org-local calendar day `ymd` ([start, end)). */
export function dayBounds(ctx: TenantContext, ymd = orgToday(ctx)) {
  const tz = ctx.organization.timezone;
  const next = new Date(`${ymd}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: zonedTimeToUtc(ymd, "00:00", tz), end: zonedTimeToUtc(next.toISOString().slice(0, 10), "00:00", tz) };
}

/** Start of the current org-local week (Monday) and month, as UTC instants. */
export function periodStarts(ctx: TenantContext) {
  const tz = ctx.organization.timezone;
  const today = orgToday(ctx);
  const d = new Date(`${today}T00:00:00.000Z`);
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - mondayOffset);
  return {
    weekStart: zonedTimeToUtc(d.toISOString().slice(0, 10), "00:00", tz),
    monthStart: zonedTimeToUtc(`${today.slice(0, 7)}-01`, "00:00", tz),
  };
}

/** Follow-up dates are calendar days (stored at UTC midnight); "today" is the org-local day. */
export function followUpToday(ctx: TenantContext) {
  return dateOnly(orgToday(ctx));
}

// ─── Slugs ──────────────────────────────────────────────────────────────────

export function slugify(text: string) {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "listing";
}

function shortSuffix() {
  return Math.random().toString(36).slice(2, 7).padEnd(5, "0");
}

/** A slug unique within the organization: the title's slug, plus a short suffix on collision. */
export async function uniqueListingSlug(db: DbClient, organizationId: string, title: string) {
  const base = slugify(title);
  let candidate = base;
  for (let attempt = 0; attempt < 6; attempt++) {
    const clash = await db.listing.findUnique({
      where: { organizationId_slug: { organizationId, slug: candidate } },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `${base}-${shortSuffix()}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}
