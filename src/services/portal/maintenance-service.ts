import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { ValidationError } from "@/lib/errors";
import { notifyMembers } from "@/lib/notifications/notify";
import { nextCode } from "@/lib/sequence";
import type { ResidentContext } from "@/lib/tenant/resident";
import { serialize } from "@/lib/serialize";
import { parseInput } from "@/lib/validation/parse";
import { portalMaintenanceSchema, type PortalListInput, type PortalMaintenanceInput } from "@/lib/validation/portal";
import { claimUpload } from "@/services/files/file-service";
import { assertCanSubmit, currentAssignment, ownWhere, parseList, residentActor, toPaginated } from "./shared";

export const OPEN_MAINTENANCE_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS"] as const;

const maintenanceSelect = {
  id: true,
  requestNumber: true,
  category: true,
  priority: true,
  title: true,
  description: true,
  status: true,
  resolutionNotes: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  room: { select: { roomNumber: true } },
  bed: { select: { bedNumber: true } },
  photos: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, originalName: true },
  },
} satisfies Prisma.MaintenanceRequestSelect;

export async function listPortalMaintenance(ctx: ResidentContext, raw?: PortalListInput) {
  const { skip, take, page, pageSize } = parseList(raw);
  const where = ownWhere(ctx);
  const [items, total] = await Promise.all([
    prisma.maintenanceRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, select: maintenanceSelect }),
    prisma.maintenanceRequest.count({ where }),
  ]);
  return serialize(toPaginated(items, total, page, pageSize));
}

export async function openPortalMaintenance(ctx: ResidentContext, take = 3) {
  const where = { ...ownWhere(ctx), status: { in: [...OPEN_MAINTENANCE_STATUSES] } };
  const [items, total] = await Promise.all([
    prisma.maintenanceRequest.findMany({ where, orderBy: { createdAt: "desc" }, take, select: maintenanceSelect }),
    prisma.maintenanceRequest.count({ where }),
  ]);
  return serialize({ items, total });
}

export async function createPortalMaintenance(ctx: ResidentContext, raw: PortalMaintenanceInput) {
  const input = parseInput(portalMaintenanceSchema, raw);
  const self = await assertCanSubmit(ctx);
  const assignment = await currentAssignment(ctx);
  // Room/bed come from the resident's own live assignment, never from input.
  const location =
    assignment && assignment.status === "ACTIVE" && assignment.hostelId === self.hostelId
      ? { roomId: assignment.roomId, bedId: assignment.bedId }
      : { roomId: null, bedId: null };
  const actor = await residentActor(ctx);
  const uploader = { organizationId: ctx.organizationId, userId: ctx.userId };

  const request = await prisma.$transaction(async (tx) => {
    // Validate every photo before creating anything: same org, uploaded by this user, unattached.
    for (const fileId of input.photoFileIds) {
      await claimUpload(tx, uploader, fileId, ["maintenance-photo"]);
    }
    const requestNumber = await nextCode(tx, ctx.organizationId, "maintenance", "MNT", 5);
    const created = await tx.maintenanceRequest.create({
      data: {
        organizationId: ctx.organizationId,
        hostelId: self.hostelId,
        residentId: ctx.residentId,
        reportedById: ctx.userId,
        requestNumber,
        category: input.category,
        priority: input.priority,
        title: input.title,
        description: input.description ?? null,
        ...location,
      },
      select: { id: true, requestNumber: true, title: true, hostelId: true },
    });
    if (input.photoFileIds.length) {
      const attached = await tx.storedFile.updateMany({
        where: {
          id: { in: input.photoFileIds },
          organizationId: ctx.organizationId,
          uploadedById: ctx.userId,
          maintenanceRequestId: null,
          deletedAt: null,
        },
        data: { maintenanceRequestId: created.id },
      });
      if (attached.count !== input.photoFileIds.length) {
        // A photo was attached elsewhere concurrently; the transaction rolls back.
        throw new ValidationError("One of the photos could not be attached. Please upload it again.");
      }
    }
    await audit(
      actor,
      {
        action: "maintenance.created",
        entityType: "MaintenanceRequest",
        entityId: created.id,
        after: {
          requestNumber,
          category: input.category,
          priority: input.priority,
          title: input.title,
          ...location,
          photos: input.photoFileIds.length,
          source: "portal",
        },
      },
      tx,
    );
    return created;
  });

  await notifyMembers(
    ctx.organizationId,
    "maintenance.manage",
    request.hostelId,
    {
      type: "MAINTENANCE_UPDATED",
      title: `New maintenance request ${request.requestNumber}`,
      body: `${ctx.name}: ${request.title}`,
      link: `/operations/maintenance/${request.id}`,
    },
    { excludeUserId: ctx.userId },
  );
  return serialize(request);
}
