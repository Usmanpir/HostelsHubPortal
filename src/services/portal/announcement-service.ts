import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ResidentContext } from "@/lib/tenant/resident";
import { serialize } from "@/lib/serialize";
import { parseList, toPaginated } from "./shared";
import type { PortalListInput } from "@/lib/validation/portal";

/**
 * Announcements this resident may read:
 *  - published (publishedAt <= now), not archived, not expired
 *  - EVERYONE / RESIDENTS audience for the whole organization or their hostel
 *  - SPECIFIC_RESIDENTS only when they are a listed recipient
 */
export function visibleAnnouncementWhere(ctx: ResidentContext, now = new Date()): Prisma.AnnouncementWhereInput {
  return {
    organizationId: ctx.organizationId,
    archivedAt: null,
    publishedAt: { lte: now },
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      {
        OR: [
          {
            audience: { in: ["EVERYONE", "RESIDENTS"] },
            OR: [{ hostelId: null }, { hostelId: ctx.hostelId }],
          },
          { audience: "SPECIFIC_RESIDENTS", recipients: { some: { residentId: ctx.residentId } } },
        ],
      },
    ],
  };
}

const announcementSelect = {
  id: true,
  title: true,
  body: true,
  category: true,
  isPinned: true,
  publishedAt: true,
  expiresAt: true,
  hostel: { select: { name: true } },
} satisfies Prisma.AnnouncementSelect;

export async function listPortalAnnouncements(ctx: ResidentContext, raw?: PortalListInput) {
  const { skip, take, page, pageSize } = parseList(raw);
  const where = visibleAnnouncementWhere(ctx);
  const [items, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      skip,
      take,
      select: announcementSelect,
    }),
    prisma.announcement.count({ where }),
  ]);
  return serialize(toPaginated(items, total, page, pageSize));
}

export async function latestPortalAnnouncements(ctx: ResidentContext, take = 3) {
  const items = await prisma.announcement.findMany({
    where: visibleAnnouncementWhere(ctx),
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
    take,
    select: announcementSelect,
  });
  return serialize(items);
}
