import "server-only";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit";
import { NotFoundError, RateLimitError, ValidationError } from "@/lib/errors";
import { notifyMembers } from "@/lib/notifications/notify";
import { hit, type RateLimitRule } from "@/lib/security/rate-limit";
import { nextCode } from "@/lib/sequence";
import { parseInput } from "@/lib/validation/parse";
import { publicInquirySchema, type PreferredContact, type PublicInquiryInput } from "@/lib/validation/public";
import { publicListingWhere, publicOrgWhere } from "./listings-service";

/** Per IP, per organization. Kept local so the shared RATE_LIMITS table stays untouched. */
export const PUBLIC_INQUIRY_LIMIT: RateLimitRule = { limit: 5, windowSeconds: 10 * 60 };

/** Submissions faster than this after the form rendered are treated as scripted. */
export const MIN_FILL_MS = 2_000;
/** A lead in one of these stages is still being worked, so repeat inquiries join it. */
const OPEN_LEAD_STAGES = ["NEW", "CONTACTED", "VIEWING", "NEGOTIATION"] as const;

const CONTACT_LABEL: Record<PreferredContact, string> = { PHONE: "Phone call", WHATSAPP: "WhatsApp", EMAIL: "Email" };

export type InquiryMeta = { ipAddress?: string | null; userAgent?: string | null; now?: number };

/**
 * Outcome is internal only (for logs/tests). Callers must show the same
 * success message regardless, so visitors can't learn whether a lead existed
 * or whether the spam filter caught them.
 */
export type InquiryOutcome = "created" | "appended" | "dropped";

/** Digits with an optional leading "+", so "+92 300-1234567" and "+923001234567" dedupe. */
export function normalizePhone(phone: string) {
  const trimmed = phone.trim();
  return (trimmed.startsWith("+") ? "+" : "") + trimmed.replace(/\D/g, "");
}

export async function submitPublicInquiry(raw: PublicInquiryInput, meta: InquiryMeta = {}): Promise<InquiryOutcome> {
  const input = parseInput(publicInquirySchema, raw);

  const org = await prisma.organization.findFirst({
    where: publicOrgWhere(input.orgSlug),
    select: { id: true },
  });
  if (!org) throw new NotFoundError("Listing");
  const listing = await prisma.listing.findFirst({
    where: { ...publicListingWhere(org.id), slug: input.listingSlug },
    select: { id: true, code: true, title: true, purpose: true, agentUserId: true },
  });
  if (!listing) throw new NotFoundError("Listing");

  const ip = meta.ipAddress || "unknown";
  const limit = await hit(`public-inquiry:${org.id}:${ip}`, PUBLIC_INQUIRY_LIMIT);
  if (!limit.allowed) throw new RateLimitError("You've sent several messages already. Please try again in a few minutes.");

  // Honeypot: pretend success so bots learn nothing.
  if (input.website) return "dropped";
  const now = meta.now ?? Date.now();
  if (input.startedAt !== undefined && now - input.startedAt < MIN_FILL_MS) {
    throw new ValidationError("Please take a moment to check your details, then send again.");
  }

  const phone = normalizePhone(input.phone);
  const lookupPhones = [...new Set([phone, input.phone.trim()])];
  const detail = [
    `Inquiry from public page`,
    `Listing: ${listing.title} (${listing.code})`,
    `Prefers: ${CONTACT_LABEL[input.preferredContact]}`,
    input.email ? `Email: ${input.email}` : null,
    input.message ? `\n${input.message}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.lead.findFirst({
      where: {
        organizationId: org.id,
        phone: { in: lookupPhones },
        archivedAt: null,
        stage: { in: [...OPEN_LEAD_STAGES] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, name: true, email: true },
    });

    if (existing) {
      await tx.leadActivity.create({
        data: { organizationId: org.id, leadId: existing.id, type: "NOTE", body: detail },
      });
      // Fill a missing email but never overwrite what staff already recorded.
      await tx.lead.update({
        where: { id: existing.id },
        data: { ...(input.email && !existing.email ? { email: input.email } : {}), updatedAt: new Date() },
      });
      await recordAudit(
        {
          organizationId: org.id,
          userId: null,
          action: "lead.inquiry_public",
          entityType: "Lead",
          entityId: existing.id,
          metadata: { listingId: listing.id },
          ipAddress: meta.ipAddress ?? null,
          userAgent: meta.userAgent ?? null,
        },
        tx,
      );
      return { outcome: "appended" as const, lead: existing };
    }

    const code = await nextCode(tx, org.id, "lead", "LEAD", 5);
    const lead = await tx.lead.create({
      data: {
        organizationId: org.id,
        code,
        name: input.name,
        phone,
        email: input.email ?? null,
        source: "WEBSITE",
        stage: "NEW",
        interest: listing.purpose,
        listingId: listing.id,
        message: input.message ?? null,
        assignedUserId: listing.agentUserId,
      },
      select: { id: true, code: true, name: true, email: true },
    });
    await tx.leadActivity.create({
      data: { organizationId: org.id, leadId: lead.id, type: "NOTE", body: detail },
    });
    await recordAudit(
      {
        organizationId: org.id,
        userId: null,
        action: "lead.created_public",
        entityType: "Lead",
        entityId: lead.id,
        after: { code, source: "WEBSITE", listingId: listing.id },
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      },
      tx,
    );
    return { outcome: "created" as const, lead };
  });

  await notifyMembers(org.id, "leads.manage", null, {
    type: "LEAD_RECEIVED",
    title: result.outcome === "created" ? `New website lead: ${input.name}` : `New inquiry from ${result.lead.name}`,
    body: `${listing.title} · ${CONTACT_LABEL[input.preferredContact]}`,
    link: `/leads/${result.lead.id}`,
  });

  return result.outcome;
}
