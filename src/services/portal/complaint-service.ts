import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { notifyMembers } from "@/lib/notifications/notify";
import { nextCode } from "@/lib/sequence";
import type { ResidentContext } from "@/lib/tenant/resident";
import { serialize } from "@/lib/serialize";
import { parseInput } from "@/lib/validation/parse";
import { portalComplaintSchema, type PortalComplaintInput, type PortalListInput } from "@/lib/validation/portal";
import { assertCanSubmit, ownWhere, parseList, residentActor, toPaginated } from "./shared";

export const OPEN_COMPLAINT_STATUSES = ["OPEN", "UNDER_REVIEW", "IN_PROGRESS"] as const;

const complaintSelect = {
  id: true,
  complaintNumber: true,
  category: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  resolution: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ComplaintSelect;

export async function listPortalComplaints(ctx: ResidentContext, raw?: PortalListInput) {
  const { skip, take, page, pageSize } = parseList(raw);
  const where = ownWhere(ctx);
  const [items, total] = await Promise.all([
    prisma.complaint.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, select: complaintSelect }),
    prisma.complaint.count({ where }),
  ]);
  return serialize(toPaginated(items, total, page, pageSize));
}

export async function openPortalComplaints(ctx: ResidentContext, take = 3) {
  const where = { ...ownWhere(ctx), status: { in: [...OPEN_COMPLAINT_STATUSES] } };
  const [items, total] = await Promise.all([
    prisma.complaint.findMany({ where, orderBy: { createdAt: "desc" }, take, select: complaintSelect }),
    prisma.complaint.count({ where }),
  ]);
  return serialize({ items, total });
}

export async function createPortalComplaint(ctx: ResidentContext, raw: PortalComplaintInput) {
  const input = parseInput(portalComplaintSchema, raw);
  const self = await assertCanSubmit(ctx);
  const actor = await residentActor(ctx);

  const complaint = await prisma.$transaction(async (tx) => {
    const complaintNumber = await nextCode(tx, ctx.organizationId, "complaint", "CMP", 5);
    const created = await tx.complaint.create({
      data: {
        organizationId: ctx.organizationId,
        hostelId: self.hostelId,
        residentId: ctx.residentId,
        submittedById: ctx.userId,
        complaintNumber,
        category: input.category,
        priority: input.priority,
        title: input.title,
        description: input.description,
      },
      select: { id: true, complaintNumber: true, title: true, hostelId: true, priority: true },
    });
    await audit(
      actor,
      {
        action: "complaint.created",
        entityType: "Complaint",
        entityId: created.id,
        after: { ...input, complaintNumber, source: "portal" },
      },
      tx,
    );
    return created;
  });

  await notifyMembers(
    ctx.organizationId,
    "complaints.manage",
    complaint.hostelId,
    {
      type: "COMPLAINT_UPDATED",
      title: `New complaint ${complaint.complaintNumber}`,
      body: `${ctx.name}: ${complaint.title}`,
      link: `/operations/complaints/${complaint.id}`,
    },
    { excludeUserId: ctx.userId },
  );
  return serialize(complaint);
}
