import { prisma } from "@/lib/db/prisma";

/** In-app notification center queries — always scoped to the signed-in user. */
export async function listNotifications(userId: string, organizationId: string, limit = 20) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, organizationId },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 50),
      select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId, organizationId, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markNotificationsRead(userId: string, organizationId: string, ids?: string[]) {
  await prisma.notification.updateMany({
    where: { userId, organizationId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
}
