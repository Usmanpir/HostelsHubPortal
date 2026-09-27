import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ApprovalStatus, ResidentRequestType } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { accessWhere, actorOf, requirePermission, scopedWhere, type TenantContext } from "@/lib/tenant/context";
import { requestDecisionSchema, type RequestDecisionInput } from "@/lib/validation/resident";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import { serialize } from "@/lib/serialize";
import { notifyResident } from "@/lib/notifications/notify";
import { approvalStatusLabels, residentRequestTypeLabels } from "@/config/labels";
import { LIVE_ASSIGNMENT_STATUSES } from "./shared";

export type RequestListFilters = {
  q?: string;
  /** Omit (or "ALL") to show every request; pending ones are listed first. */
  status?: ApprovalStatus | "ALL";
  type?: ResidentRequestType;
  hostelId?: string | null;
  residentId?: string;
  page?: number;
  pageSize?: number;
};

export async function listResidentRequests(ctx: TenantContext, filters: RequestListFilters = {}) {
  requirePermission(ctx, "requests.view");
  const { skip, take, page, pageSize } = paginate(filters);
  const terms = (filters.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const where: Prisma.ResidentRequestWhereInput = {
    ...scopedWhere(ctx, filters.hostelId),
    ...(filters.status && filters.status !== "ALL" ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.residentId ? { residentId: filters.residentId } : {}),
    ...(terms.length
      ? {
          AND: terms.map((t) => ({
            OR: [
              { subject: { contains: t, mode: "insensitive" as const } },
              { resident: { firstName: { contains: t, mode: "insensitive" as const } } },
              { resident: { lastName: { contains: t, mode: "insensitive" as const } } },
              { resident: { residentCode: { contains: t, mode: "insensitive" as const } } },
            ],
          })),
        }
      : {}),
  };
  const [rows, total, pending] = await Promise.all([
    prisma.residentRequest.findMany({
      where,
      skip,
      take,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        hostel: { select: { id: true, name: true } },
        reviewedBy: { select: { name: true } },
        resident: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            residentCode: true,
            phone: true,
            assignments: {
              where: { status: { in: LIVE_ASSIGNMENT_STATUSES } },
              take: 1,
              select: { room: { select: { roomNumber: true } }, bed: { select: { bedNumber: true } } },
            },
          },
        },
      },
    }),
    prisma.residentRequest.count({ where }),
    prisma.residentRequest.count({ where: { ...scopedWhere(ctx, filters.hostelId), status: "PENDING" } }),
  ]);
  return serialize({ ...toPaginated(rows, total, page, pageSize), pending });
}

/** Approve or reject a pending resident request and tell the resident. */
export async function decideResidentRequest(ctx: TenantContext, id: string, raw: RequestDecisionInput) {
  requirePermission(ctx, "requests.manage");
  const input = parseInput(requestDecisionSchema, raw);
  const request = await prisma.$transaction(async (tx) => {
    const before = await tx.residentRequest.findFirst({ where: { id, ...accessWhere(ctx) } });
    if (!before) throw new NotFoundError("Request");
    if (before.status !== "PENDING") {
      throw new BusinessRuleError(`This request was already ${approvalStatusLabels[before.status].toLowerCase()}.`);
    }
    const updated = await tx.residentRequest.update({
      where: { id },
      data: { status: input.status, response: input.response ?? null, reviewedById: ctx.userId, reviewedAt: new Date() },
    });
    await audit(
      actorOf(ctx),
      {
        action: input.status === "APPROVED" ? "request.approved" : "request.rejected",
        entityType: "ResidentRequest",
        entityId: id,
        before: { status: before.status },
        after: { status: updated.status, response: updated.response },
      },
      tx,
    );
    return updated;
  });
  await notifyResident(ctx.organizationId, request.residentId, {
    type: "REQUEST_UPDATED",
    title: `${residentRequestTypeLabels[request.type]} request ${approvalStatusLabels[request.status].toLowerCase()}`,
    body: input.response ? `${request.subject} — ${input.response}` : request.subject,
    link: "/portal/requests",
  });
  return serialize(request);
}
