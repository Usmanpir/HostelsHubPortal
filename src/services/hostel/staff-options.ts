import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/tenant/context";
import { fullName } from "@/lib/format";

/** Active staff as select options (e.g. hostel manager picker). */
export async function listStaffOptions(ctx: TenantContext, hostelId?: string) {
  const staff = await prisma.staff.findMany({
    where: {
      organizationId: ctx.organizationId,
      archivedAt: null,
      status: { in: ["ACTIVE", "ON_LEAVE"] },
      ...(hostelId ? { hostels: { some: { hostelId } } } : {}),
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { id: true, firstName: true, lastName: true, designation: true },
  });
  return staff.map((s) => ({ id: s.id, name: fullName(s), designation: s.designation }));
}
