import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { actorOf, can, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { parseInput } from "@/lib/validation/parse";
import {
  viewingFiltersSchema,
  viewingOutcomeSchema,
  viewingRescheduleSchema,
  viewingSchema,
  zonedTimeToUtc,
  type ViewingFilters,
  type ViewingInput,
  type ViewingOutcomeInput,
  type ViewingRescheduleInput,
} from "@/lib/validation/real-estate";
import { serialize } from "@/lib/serialize";
import { formatDateTime } from "@/lib/format";
import { notifyUsers } from "@/lib/notifications/notify";
import { viewingStatusLabels } from "@/config/real-estate-labels";
import { assertAgentMember, assertDealerEnabled, dayBounds } from "./shared";
import { applyLeadStage } from "./lead-service";

const ENTITY = "Viewing";

const include = {
  lead: { select: { id: true, code: true, name: true, phone: true, stage: true } },
  listing: { select: { id: true, code: true, title: true, address: true, locality: true, city: true } },
  agent: { select: { id: true, name: true } },
} satisfies Prisma.ViewingInclude;

function buildWhere(ctx: TenantContext, f: ReturnType<typeof viewingFiltersSchema.parse>): Prisma.ViewingWhereInput {
  return {
    organizationId: ctx.organizationId,
    lead: { archivedAt: null },
    ...(f.leadId ? { leadId: f.leadId } : {}),
    ...(f.listingId ? { listingId: f.listingId } : {}),
    ...(f.mine ? { agentUserId: ctx.userId } : f.agentUserId ? { agentUserId: f.agentUserId } : {}),
    ...(f.status ? { status: f.status } : {}),
  };
}

/**
 * Viewings grouped for the schedule page: today (org time zone), upcoming
 * and the most recent past ones. Overdue SCHEDULED viewings stay under
 * "Past" so they can still be marked completed / no-show.
 */
export async function listViewingsGrouped(ctx: TenantContext, raw: ViewingFilters = {}, limits = { upcoming: 100, past: 50 }) {
  requirePermission(ctx, "leads.view");
  assertDealerEnabled(ctx);
  const filters = parseInput(viewingFiltersSchema, raw);
  const where = buildWhere(ctx, filters);
  const { start, end } = dayBounds(ctx);
  const [today, upcoming, past, needsOutcome] = await Promise.all([
    prisma.viewing.findMany({ where: { ...where, scheduledAt: { gte: start, lt: end } }, orderBy: { scheduledAt: "asc" }, include }),
    prisma.viewing.findMany({ where: { ...where, scheduledAt: { gte: end } }, orderBy: { scheduledAt: "asc" }, take: limits.upcoming, include }),
    prisma.viewing.findMany({ where: { ...where, scheduledAt: { lt: start } }, orderBy: { scheduledAt: "desc" }, take: limits.past, include }),
    prisma.viewing.count({ where: { ...where, status: "SCHEDULED", scheduledAt: { lt: new Date() } } }),
  ]);
  return serialize({ today, upcoming, past, needsOutcome });
}

export async function getViewing(ctx: TenantContext, id: string) {
  requirePermission(ctx, "leads.view");
  assertDealerEnabled(ctx);
  const viewing = await prisma.viewing.findFirst({ where: { id, organizationId: ctx.organizationId }, include });
  if (!viewing) throw new NotFoundError("Viewing");
  return serialize(viewing);
}

function link() {
  return "/leads/viewings";
}

export async function scheduleViewing(ctx: TenantContext, raw: ViewingInput) {
  requirePermission(ctx, "leads.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(viewingSchema, raw);
  const [lead, listing] = await Promise.all([
    prisma.lead.findFirst({ where: { id: input.leadId, organizationId: ctx.organizationId, archivedAt: null } }),
    prisma.listing.findFirst({
      where: { id: input.listingId, organizationId: ctx.organizationId },
      select: { id: true, code: true, title: true, status: true, agentUserId: true },
    }),
  ]);
  if (!lead) throw new NotFoundError("Lead");
  if (!listing) throw new NotFoundError("Listing");
  if (lead.stage === "WON" || lead.stage === "LOST") throw new BusinessRuleError("This lead is closed. Reopen it before scheduling a viewing.");
  if (listing.status === "SOLD" || listing.status === "RENTED" || listing.status === "ARCHIVED") {
    throw new BusinessRuleError("This listing is no longer available for viewings.");
  }
  const scheduledAt = zonedTimeToUtc(input.date, input.time, ctx.organization.timezone);
  if (scheduledAt.getTime() < Date.now() - 5 * 60_000) {
    throw new BusinessRuleError("Pick a date and time in the future.");
  }
  const agentId = input.agentUserId ?? lead.assignedUserId ?? listing.agentUserId ?? null;
  const agent = agentId ? await assertAgentMember(ctx, agentId) : null;
  const when = formatDateTime(scheduledAt, ctx.organization.timezone, ctx.organization.locale);

  const viewing = await prisma.$transaction(async (tx) => {
    const created = await tx.viewing.create({
      data: {
        organizationId: ctx.organizationId,
        leadId: lead.id,
        listingId: listing.id,
        scheduledAt,
        agentUserId: agent?.id ?? null,
      },
    });
    await tx.leadActivity.create({
      data: {
        organizationId: ctx.organizationId,
        leadId: lead.id,
        userId: ctx.userId,
        type: "MEETING",
        body: `Viewing scheduled: ${listing.code} · ${listing.title} on ${when}${agent ? ` with ${agent.name}` : ""}`,
      },
    });
    if (lead.stage === "NEW" || lead.stage === "CONTACTED") {
      await applyLeadStage(tx, ctx, lead, "VIEWING", { reason: "viewing scheduled" });
    }
    await audit(
      actorOf(ctx),
      { action: "viewing.scheduled", entityType: ENTITY, entityId: created.id, after: { leadId: lead.id, listingId: listing.id, scheduledAt, agent: agent?.name ?? null } },
      tx,
    );
    return created;
  });

  if (agent && agent.id !== ctx.userId) {
    await notifyUsers(ctx.organizationId, [agent.id], {
      type: "VIEWING_SCHEDULED",
      title: `Viewing scheduled: ${listing.title}`,
      body: `${lead.name} · ${when}`,
      link: link(),
    });
  }
  return serialize(viewing);
}

async function loadViewing(ctx: TenantContext, id: string) {
  const viewing = await prisma.viewing.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { lead: { select: { id: true, name: true, archivedAt: true } }, listing: { select: { id: true, code: true, title: true } } },
  });
  if (!viewing) throw new NotFoundError("Viewing");
  return viewing;
}

export async function rescheduleViewing(ctx: TenantContext, id: string, raw: ViewingRescheduleInput) {
  requirePermission(ctx, "leads.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(viewingRescheduleSchema, raw);
  const before = await loadViewing(ctx, id);
  if (before.status !== "SCHEDULED") throw new BusinessRuleError("Only scheduled viewings can be rescheduled.");
  const scheduledAt = zonedTimeToUtc(input.date, input.time, ctx.organization.timezone);
  if (scheduledAt.getTime() < Date.now() - 5 * 60_000) throw new BusinessRuleError("Pick a date and time in the future.");
  const agentChanged = (input.agentUserId ?? null) !== before.agentUserId;
  const agent = input.agentUserId ? await assertAgentMember(ctx, input.agentUserId) : null;
  const when = formatDateTime(scheduledAt, ctx.organization.timezone, ctx.organization.locale);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.viewing.update({ where: { id }, data: { scheduledAt, agentUserId: agent?.id ?? null } });
    await tx.leadActivity.create({
      data: {
        organizationId: ctx.organizationId,
        leadId: before.leadId,
        userId: ctx.userId,
        type: "MEETING",
        body: `Viewing of ${before.listing.code} rescheduled to ${when}${agent ? ` with ${agent.name}` : ""}`,
      },
    });
    await audit(
      actorOf(ctx),
      { action: "viewing.rescheduled", entityType: ENTITY, entityId: id, before: { scheduledAt: before.scheduledAt, agentUserId: before.agentUserId }, after: { scheduledAt, agentUserId: row.agentUserId } },
      tx,
    );
    return row;
  });

  if (agent && agent.id !== ctx.userId) {
    await notifyUsers(ctx.organizationId, [agent.id], {
      type: "VIEWING_SCHEDULED",
      title: agentChanged ? `Viewing assigned to you: ${before.listing.title}` : `Viewing rescheduled: ${before.listing.title}`,
      body: `${before.lead.name} · ${when}`,
      link: link(),
    });
  }
  return serialize(updated);
}

/** Record the outcome of a viewing: completed (with feedback), cancelled or no-show. */
export async function recordViewingOutcome(ctx: TenantContext, id: string, raw: ViewingOutcomeInput) {
  requirePermission(ctx, "leads.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(viewingOutcomeSchema, raw);
  const before = await loadViewing(ctx, id);
  const editingFeedback = before.status === "COMPLETED" && input.status === "COMPLETED";
  if (before.status !== "SCHEDULED" && !editingFeedback) {
    throw new BusinessRuleError(`This viewing is already ${viewingStatusLabels[before.status].toLowerCase()}.`);
  }
  if (input.status === "COMPLETED" && before.scheduledAt.getTime() > Date.now() + 60 * 60_000) {
    throw new BusinessRuleError("A viewing can't be marked completed before it happens.");
  }
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.viewing.update({ where: { id }, data: { status: input.status, feedback: input.feedback ?? null } });
    const verb =
      input.status === "COMPLETED" ? (editingFeedback ? "Viewing feedback updated" : "Viewing completed") : input.status === "CANCELLED" ? "Viewing cancelled" : "Client did not show up for the viewing";
    await tx.leadActivity.create({
      data: {
        organizationId: ctx.organizationId,
        leadId: before.leadId,
        userId: ctx.userId,
        type: "MEETING",
        body: `${verb}: ${before.listing.code} · ${before.listing.title}${input.feedback ? ` — ${input.feedback}` : ""}`,
      },
    });
    if (input.status === "COMPLETED") await tx.lead.update({ where: { id: before.leadId }, data: { lastContactedAt: new Date() } });
    await audit(
      actorOf(ctx),
      { action: "viewing.status_changed", entityType: ENTITY, entityId: id, before: { status: before.status, feedback: before.feedback }, after: { status: row.status, feedback: row.feedback } },
      tx,
    );
    return row;
  });
  return serialize(updated);
}

/** Viewings visible in this org today — for dashboards. */
export async function countViewingsToday(ctx: TenantContext) {
  if (!can(ctx, "leads.view") || !ctx.organization.dealerEnabled) return 0;
  const { start, end } = dayBounds(ctx);
  return prisma.viewing.count({
    where: { organizationId: ctx.organizationId, status: "SCHEDULED", scheduledAt: { gte: start, lt: end }, lead: { archivedAt: null } },
  });
}
