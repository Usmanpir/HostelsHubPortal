import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { NotificationType } from "@/generated/prisma/enums";
import type { Permission } from "@/lib/permissions/catalog";
import { externalChannels, type OutboundNotification } from "./channels";

export type NotificationPayload = {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
};

type OrgNotificationSettings = {
  email?: boolean;
  events?: Partial<Record<NotificationType, boolean>>;
};

/**
 * Deliver a notification to specific users: always in-app, plus external
 * channels when enabled in the organization's notification settings.
 * Call after the business transaction commits; failures are logged, never
 * thrown, so a mail outage cannot break a payment.
 */
export async function notifyUsers(organizationId: string, userIds: string[], payload: NotificationPayload) {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { notificationSettings: true, brandName: true, name: true },
    });
    if (!org) return;
    const settings = (org.notificationSettings ?? {}) as OrgNotificationSettings;
    if (settings.events?.[payload.type] === false) return;

    await prisma.notification.createMany({
      data: unique.map((userId) => ({ organizationId, userId, ...payload })),
    });

    if (!settings.email) return;
    const users = await prisma.user.findMany({
      where: { id: { in: unique }, status: "ACTIVE" },
      select: { id: true, email: true, phone: true },
    });
    const outbound: OutboundNotification[] = users.map((u) => ({
      organizationId,
      userId: u.id,
      email: u.email,
      phone: u.phone,
      senderName: org.brandName ?? org.name,
      ...payload,
    }));
    await Promise.allSettled(
      outbound.flatMap((n) => externalChannels.filter((c) => c.supports(n)).map((c) => c.send(n))),
    );
  } catch (error) {
    console.error("[notify] failed", error);
  }
}

/** Notify every active member who holds `permission` and can access `hostelId`. */
export async function notifyMembers(
  organizationId: string,
  permission: Permission,
  hostelId: string | null,
  payload: NotificationPayload,
  options: { excludeUserId?: string } = {},
) {
  try {
    const members = await prisma.organizationMember.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        role: { permissions: { some: { permission } } },
        ...(hostelId
          ? { OR: [{ allHostels: true }, { hostelAccess: { some: { hostelId } } }] }
          : {}),
      },
      select: { userId: true },
    });
    await notifyUsers(
      organizationId,
      members.map((m) => m.userId).filter((id) => id !== options.excludeUserId),
      payload,
    );
  } catch (error) {
    console.error("[notify] failed", error);
  }
}

/** Notify a resident (if they have a portal account). */
export async function notifyResident(organizationId: string, residentId: string, payload: NotificationPayload) {
  try {
    const resident = await prisma.resident.findFirst({
      where: { id: residentId, organizationId },
      select: { userId: true },
    });
    if (resident?.userId) await notifyUsers(organizationId, [resident.userId], payload);
  } catch (error) {
    console.error("[notify] failed", error);
  }
}
