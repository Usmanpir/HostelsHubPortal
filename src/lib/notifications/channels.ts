import type { NotificationType } from "@/generated/prisma/enums";
import { sendEmail } from "./mailer";

/** A message addressed to one user, independent of delivery channel. */
export type OutboundNotification = {
  organizationId: string;
  userId: string;
  email?: string | null;
  phone?: string | null;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  senderName?: string;
};

/**
 * Delivery channel. In-app delivery is handled by the notification service
 * (database rows); external channels implement this interface. To add SMS or
 * WhatsApp, implement `NotificationChannel` with the provider SDK and register
 * it in `externalChannels` — callers do not change.
 */
export interface NotificationChannel {
  readonly key: "email" | "sms" | "whatsapp";
  supports(n: OutboundNotification): boolean;
  send(n: OutboundNotification): Promise<void>;
}

export const emailChannel: NotificationChannel = {
  key: "email",
  supports: (n) => !!n.email,
  async send(n) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const link = n.link ? `\n\nOpen: ${appUrl}${n.link}` : "";
    await sendEmail({
      to: n.email!,
      subject: n.title,
      text: `${n.body ?? n.title}${link}`,
      fromName: n.senderName,
    });
  },
};

export const externalChannels: NotificationChannel[] = [emailChannel];
