import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import { notifyMembers } from "@/lib/notifications/notify";
import type { ResidentContext } from "@/lib/tenant/resident";
import { serialize } from "@/lib/serialize";
import { dateOnly, formatDate, todayInTimeZone } from "@/lib/format";
import { idSchema } from "@/lib/validation/common";
import { parseInput } from "@/lib/validation/parse";
import { portalRequestSchema, type PortalListInput, type PortalRequestInput } from "@/lib/validation/portal";
import { residentRequestTypeLabels, roomTypeLabels } from "@/config/labels";
import { assertCanSubmit, ownWhere, parseList, residentActor, toPaginated } from "./shared";

const requestSelect = {
  id: true,
  type: true,
  subject: true,
  details: true,
  startDate: true,
  endDate: true,
  status: true,
  response: true,
  reviewedAt: true,
  createdAt: true,
} satisfies Prisma.ResidentRequestSelect;

export async function listPortalRequests(ctx: ResidentContext, raw?: PortalListInput) {
  const { skip, take, page, pageSize } = parseList(raw);
  const where = ownWhere(ctx);
  const [items, total] = await Promise.all([
    prisma.residentRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, select: requestSelect }),
    prisma.residentRequest.count({ where }),
  ]);
  return serialize(toPaginated(items, total, page, pageSize));
}

const MAX_LEAVE_DAYS = 180;
const MAX_PENDING = 5;

export async function createPortalRequest(ctx: ResidentContext, raw: PortalRequestInput) {
  const input = parseInput(portalRequestSchema, raw);
  const self = await assertCanSubmit(ctx);

  const pending = await prisma.residentRequest.count({ where: { ...ownWhere(ctx), status: "PENDING" } });
  if (pending >= MAX_PENDING) {
    throw new BusinessRuleError(`You already have ${pending} pending requests. Wait for a response or cancel one first.`);
  }

  let subject: string;
  let details = input.details ?? null;
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (input.type === "LEAVE") {
    startDate = dateOnly(input.startDate!);
    endDate = dateOnly(input.endDate!);
    const today = dateOnly(todayInTimeZone(ctx.organization.timezone));
    if (startDate < today) {
      throw new ValidationError("Leave can't start in the past.", { startDate: ["Leave can't start in the past"] });
    }
    const days = Math.round((endDate.getTime() - startDate.getTime()) / 86400_000) + 1;
    if (days > MAX_LEAVE_DAYS) {
      throw new ValidationError(`Leave can be at most ${MAX_LEAVE_DAYS} days.`, { endDate: [`At most ${MAX_LEAVE_DAYS} days`] });
    }
    subject = `Leave: ${formatDate(startDate)} – ${formatDate(endDate)} (${days} day${days === 1 ? "" : "s"})`;
  } else if (input.type === "ROOM_CHANGE") {
    subject = input.preferredRoomType
      ? `Room change — prefers ${roomTypeLabels[input.preferredRoomType].toLowerCase()} room`
      : "Room change request";
    if (input.preferredRoomType) details = `Preferred room type: ${roomTypeLabels[input.preferredRoomType]}\n\n${details ?? ""}`.trim();
  } else {
    subject = input.subject!;
  }

  const actor = await residentActor(ctx);
  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.residentRequest.create({
      data: {
        organizationId: ctx.organizationId,
        hostelId: self.hostelId,
        residentId: ctx.residentId,
        type: input.type,
        subject: subject.slice(0, 200),
        details,
        startDate,
        endDate,
      },
      select: { id: true, type: true, subject: true, hostelId: true },
    });
    await audit(
      actor,
      {
        action: "request.created",
        entityType: "ResidentRequest",
        entityId: created.id,
        after: { type: input.type, subject: created.subject, startDate, endDate, source: "portal" },
      },
      tx,
    );
    return created;
  });

  await notifyMembers(
    ctx.organizationId,
    "requests.manage",
    request.hostelId,
    {
      type: "REQUEST_UPDATED",
      title: `New ${residentRequestTypeLabels[request.type].toLowerCase()} request`,
      body: `${ctx.name}: ${request.subject}`,
      link: "/residents/requests",
    },
    { excludeUserId: ctx.userId },
  );
  return serialize(request);
}

/** Residents may withdraw their own request while it is still pending. */
export async function cancelPortalRequest(ctx: ResidentContext, rawId: string) {
  const id = parseInput(idSchema, rawId);
  const actor = await residentActor(ctx);
  await prisma.$transaction(async (tx) => {
    const request = await tx.residentRequest.findFirst({ where: { id, ...ownWhere(ctx) }, select: { id: true, status: true } });
    if (!request) throw new NotFoundError("Request");
    if (request.status !== "PENDING") throw new BusinessRuleError("Only pending requests can be cancelled.");
    const updated = await tx.residentRequest.updateMany({
      where: { id, ...ownWhere(ctx), status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    if (updated.count === 0) throw new BusinessRuleError("This request was just reviewed and can no longer be cancelled.");
    await audit(
      actor,
      {
        action: "request.cancelled",
        entityType: "ResidentRequest",
        entityId: id,
        before: { status: "PENDING" },
        after: { status: "CANCELLED" },
        metadata: { source: "portal" },
      },
      tx,
    );
  });
}
