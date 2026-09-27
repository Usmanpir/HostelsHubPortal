import "server-only";
import { recordAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/notifications/mailer";
import { parseInput } from "@/lib/validation/parse";
import { demoRequestSchema, type DemoRequestInput } from "@/lib/validation/auth";
import { APP_NAME } from "@/config/defaults";
import type { RequestMeta } from "./auth-service";

/** Inbox for demo requests: SALES_EMAIL, falling back to the platform sender address. */
function salesInbox() {
  const configured = process.env.SALES_EMAIL?.trim();
  if (configured) return configured;
  const from = process.env.EMAIL_FROM ?? "";
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim() || null;
}

/** Forward a "Book a demo" request from the landing page to the sales inbox. */
export async function sendDemoRequest(raw: DemoRequestInput, meta: RequestMeta = {}) {
  const input = parseInput(demoRequestSchema, raw);
  // Bots fill every field; pretend success so they learn nothing.
  if (input.website) return;

  const to = salesInbox();
  const lines = [
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Company: ${input.company ?? "—"}`,
    `Phone: ${input.phone ?? "—"}`,
    `Hostels: ${input.hostels}`,
    "",
    input.message ?? "(no message)",
  ];
  if (to) {
    await sendEmail({ to, subject: `Demo request from ${input.name}${input.company ? ` (${input.company})` : ""}`, text: lines.join("\n") });
  } else {
    console.info(`[demo-request] no SALES_EMAIL/EMAIL_FROM configured\n${lines.join("\n")}`);
  }
  await sendEmail({
    to: input.email,
    subject: `Thanks for your interest in ${APP_NAME}`,
    text: `Hi ${input.name},\n\nThanks for requesting a demo of ${APP_NAME}. We've received your request and will get back to you to find a time that works for you.\n\nIn the meantime you can start a free trial at any time — no credit card required.`,
  }).catch((e) => console.error("[demo-request] confirmation email failed", e));

  await recordAudit({
    action: "marketing.demo_requested",
    entityType: "DemoRequest",
    metadata: { email: input.email, company: input.company ?? null, hostels: input.hostels },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}
