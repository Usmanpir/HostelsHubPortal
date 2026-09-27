import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { ResidentContext } from "@/lib/tenant/resident";
import { serialize } from "@/lib/serialize";
import { currentAssignment, ownWhere } from "./shared";

/**
 * Room overview for the resident. Roommates are reported as a count only —
 * no names, contacts or bed numbers of other residents are ever returned.
 */
export async function getPortalRoom(ctx: ResidentContext) {
  const [assignment, hostel, history] = await Promise.all([
    currentAssignment(ctx),
    prisma.hostel.findFirst({
      where: { id: ctx.hostelId, organizationId: ctx.organizationId },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        country: true,
        phone: true,
        email: true,
        rules: true,
        amenities: true,
        rentDueDay: true,
        lateFeeAmount: true,
        lateFeeGraceDays: true,
      },
    }),
    prisma.residentAssignment.findMany({
      where: ownWhere(ctx),
      orderBy: [{ checkInDate: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        status: true,
        checkInDate: true,
        checkOutDate: true,
        monthlyRent: true,
        endReason: true,
        hostel: { select: { name: true } },
        room: { select: { roomNumber: true } },
        bed: { select: { bedNumber: true } },
      },
    }),
  ]);

  const roommates = assignment
    ? await prisma.residentAssignment.count({
        where: {
          organizationId: ctx.organizationId,
          roomId: assignment.roomId,
          status: "ACTIVE",
          residentId: { not: ctx.residentId },
        },
      })
    : 0;

  return serialize({ assignment, roommates, hostel, history });
}
