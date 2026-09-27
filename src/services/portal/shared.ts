import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import type { AuditActor } from "@/lib/audit";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { clientIpFromHeaders } from "@/lib/security/request";
import type { ResidentContext } from "@/lib/tenant/resident";
import { paginate, toPaginated } from "@/lib/validation/common";
import { parseInput } from "@/lib/validation/parse";
import { portalListSchema, type PortalListInput } from "@/lib/validation/portal";

/**
 * Every portal query is filtered by BOTH the organization and the resident
 * from the server-side ResidentContext. Never pass ids from the client here.
 */
export function ownWhere(ctx: ResidentContext) {
  return { organizationId: ctx.organizationId, residentId: ctx.residentId };
}

/** Audit actor for resident-initiated changes (userId = the resident's user). */
export async function residentActor(ctx: ResidentContext): Promise<AuditActor> {
  let ipAddress: string | null = null;
  let userAgent: string | null = null;
  try {
    const hdrs = await headers();
    ipAddress = clientIpFromHeaders(hdrs);
    userAgent = hdrs.get("user-agent");
  } catch {
    // Outside a request scope (e.g. scripts) — audit without request metadata.
  }
  return { organizationId: ctx.organizationId, userId: ctx.userId, ipAddress, userAgent };
}

export function parseList(raw: PortalListInput | undefined) {
  const input = parseInput(portalListSchema, raw ?? {});
  return paginate(input);
}

export { toPaginated };

/** Statuses that may still raise complaints, maintenance and requests. */
const SUBMITTING_STATUSES = new Set(["ACTIVE", "NOTICE"]);

/** Current resident row (status + hostel) — re-read so a check-out takes effect immediately. */
export async function loadSelf(ctx: ResidentContext) {
  const resident = await prisma.resident.findFirst({
    where: { id: ctx.residentId, organizationId: ctx.organizationId, archivedAt: null },
    select: { id: true, hostelId: true, status: true, firstName: true, lastName: true, residentCode: true },
  });
  if (!resident) throw new NotFoundError("Resident");
  return resident;
}

export async function assertCanSubmit(ctx: ResidentContext) {
  const self = await loadSelf(ctx);
  if (!SUBMITTING_STATUSES.has(self.status)) {
    throw new BusinessRuleError("Your stay has ended, so new submissions are closed. Please contact the hostel office.");
  }
  return self;
}

/** The resident's live bed assignment (ACTIVE first, otherwise RESERVED), or null. */
export async function currentAssignment(ctx: ResidentContext) {
  return prisma.residentAssignment.findFirst({
    where: { ...ownWhere(ctx), status: { in: ["ACTIVE", "RESERVED"] } },
    // Enum order is RESERVED < ACTIVE, so desc puts a live stay first.
    orderBy: [{ status: "desc" }, { checkInDate: "desc" }],
    select: {
      id: true,
      status: true,
      checkInDate: true,
      checkOutDate: true,
      monthlyRent: true,
      securityDeposit: true,
      hostelId: true,
      roomId: true,
      bedId: true,
      hostel: { select: { id: true, name: true, code: true, address: true, city: true, phone: true, email: true } },
      room: {
        select: {
          id: true,
          roomNumber: true,
          roomType: true,
          capacity: true,
          amenities: true,
          floor: { select: { name: true, floorNumber: true } },
        },
      },
      bed: { select: { id: true, bedNumber: true } },
    },
  });
}
