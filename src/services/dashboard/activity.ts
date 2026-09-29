import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { round2, toNumber } from "@/lib/serialize";
import { can, scopedWhere, type TenantContext } from "@/lib/tenant/context";
import type { Permission } from "@/lib/permissions/catalog";

export type ActivityKind = "resident" | "checkin" | "checkout" | "payment" | "invoice" | "complaint" | "maintenance" | "staff" | "visitor" | "other";

export type ActivityPart = { text: string; strong?: boolean } | { amount: number };

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  actor: string | null;
  parts: ActivityPart[];
  href: string | null;
  at: Date;
};

const FEED_LIMIT = 10;

const KIND_PERMISSION: Record<ActivityKind, Permission | null> = {
  resident: "residents.view",
  checkin: "residents.view",
  checkout: "residents.view",
  payment: "payments.view",
  invoice: "invoices.view",
  complaint: "complaints.view",
  maintenance: "maintenance.view",
  staff: "staff.view",
  visitor: "visitors.view",
  other: null,
};

const FEED_PREFIXES = ["resident.", "assignment.", "payment.", "invoice.", "complaint.", "maintenance.", "staff.", "visitor.", "checkin.", "checkout."];

const name = (p: { firstName: string; lastName: string } | null | undefined) => (p ? `${p.firstName} ${p.lastName}`.trim() : null);

function humanVerb(action: string) {
  const verb = action.split(".").slice(1).join(" ").replace(/_/g, " ").trim();
  return verb || "updated";
}

function kindOf(action: string, entityType: string): ActivityKind {
  const a = action.toLowerCase();
  if (a.includes("check_out") || a.includes("checked_out") || a.includes("checkout")) return "checkout";
  if (a.includes("check_in") || a.includes("checked_in") || a.includes("checkin") || a === "assignment.created") return "checkin";
  if (a.startsWith("resident.") || a.startsWith("assignment.")) return "resident";
  if (a.startsWith("payment.")) return "payment";
  if (a.startsWith("invoice.")) return "invoice";
  if (a.startsWith("complaint.")) return "complaint";
  if (a.startsWith("maintenance.") || entityType === "MaintenanceRequest") return "maintenance";
  if (a.startsWith("staff.")) return "staff";
  if (a.startsWith("visitor.")) return "visitor";
  return "other";
}

/** Organization-wide feed from the audit log (members with access to every hostel). */
async function auditFeed(ctx: TenantContext): Promise<ActivityItem[]> {
  const logs = await prisma.auditLog.findMany({
    where: {
      organizationId: ctx.organizationId,
      OR: FEED_PREFIXES.map((p) => ({ action: { startsWith: p } })),
      // Online checkout bookkeeping; the resulting "payment.created" entry already tells the story.
      NOT: { action: { startsWith: "payment.online_" } },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, action: true, entityType: true, entityId: true, createdAt: true, user: { select: { name: true } } },
  });
  const visible = logs.filter((l) => {
    const perm = KIND_PERMISSION[kindOf(l.action, l.entityType)];
    return !perm || can(ctx, perm);
  });
  const entries = visible.slice(0, FEED_LIMIT);
  const idsOf = (type: string) => [...new Set(entries.filter((e) => e.entityType === type && e.entityId).map((e) => e.entityId!))];
  const org = ctx.organizationId;
  const [residents, payments, invoices, complaints, maintenance, assignments, staff, visitors] = await Promise.all([
    prisma.resident.findMany({ where: { organizationId: org, id: { in: idsOf("Resident") } }, select: { id: true, firstName: true, lastName: true } }),
    prisma.payment.findMany({
      where: { organizationId: org, id: { in: idsOf("Payment") } },
      select: { id: true, amount: true, receiptNumber: true, resident: { select: { firstName: true, lastName: true } } },
    }),
    prisma.invoice.findMany({
      where: { organizationId: org, id: { in: idsOf("Invoice") } },
      select: { id: true, invoiceNumber: true, total: true, resident: { select: { firstName: true, lastName: true } } },
    }),
    prisma.complaint.findMany({ where: { organizationId: org, id: { in: idsOf("Complaint") } }, select: { id: true, title: true } }),
    prisma.maintenanceRequest.findMany({ where: { organizationId: org, id: { in: idsOf("MaintenanceRequest") } }, select: { id: true, title: true } }),
    prisma.residentAssignment.findMany({
      where: { organizationId: org, id: { in: idsOf("ResidentAssignment") } },
      select: { id: true, residentId: true, resident: { select: { firstName: true, lastName: true } }, room: { select: { roomNumber: true } } },
    }),
    prisma.staff.findMany({ where: { organizationId: org, id: { in: idsOf("Staff") } }, select: { id: true, firstName: true, lastName: true } }),
    prisma.visitor.findMany({ where: { organizationId: org, id: { in: idsOf("Visitor") } }, select: { id: true, name: true } }),
  ]);
  const R = new Map(residents.map((r) => [r.id, r]));
  const P = new Map(payments.map((p) => [p.id, p]));
  const I = new Map(invoices.map((i) => [i.id, i]));
  const C = new Map(complaints.map((c) => [c.id, c]));
  const M = new Map(maintenance.map((m) => [m.id, m]));
  const A = new Map(assignments.map((a) => [a.id, a]));
  const S = new Map(staff.map((s) => [s.id, s]));
  const V = new Map(visitors.map((v) => [v.id, v]));

  return entries.map((e) => {
    const kind = kindOf(e.action, e.entityType);
    const id = e.entityId ?? "";
    const verb = humanVerb(e.action);
    let parts: ActivityPart[] = [{ text: `${verb} ${e.entityType.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}` }];
    let href: string | null = null;

    switch (e.entityType) {
      case "Payment": {
        const p = P.get(id);
        href = p ? `/finance/payments/${id}` : null;
        const who = name(p?.resident);
        if (e.action === "payment.created" && p && who && who === e.user?.name) parts = [{ text: "paid" }, { amount: round2(toNumber(p.amount)) }];
        else if (e.action === "payment.created" && p) parts = [{ text: "recorded a payment of" }, { amount: round2(toNumber(p.amount)) }, ...(who ? [{ text: "from" }, { text: who, strong: true }] : [])];
        else if (e.action === "payment.refund_created" && p) parts = [{ text: "issued a refund of" }, { amount: round2(toNumber(p.amount)) }, ...(who ? [{ text: "to" }, { text: who, strong: true }] : [])];
        else if (e.action === "payment.credit_applied" && p) parts = [{ text: "applied credit of" }, { amount: round2(toNumber(p.amount)) }, ...(who ? [{ text: "for" }, { text: who, strong: true }] : [])];
        else parts = [{ text: `${verb} payment` }, ...(p ? [{ text: p.receiptNumber, strong: true }] : [])];
        break;
      }
      case "Invoice": {
        const i = I.get(id);
        href = i ? `/finance/invoices/${id}` : null;
        parts = [{ text: `${verb} invoice` }, ...(i ? [{ text: i.invoiceNumber, strong: true }, { text: "for" }, { amount: round2(toNumber(i.total)) }] : [])];
        break;
      }
      case "Resident": {
        const r = R.get(id);
        href = r ? `/residents/${id}` : null;
        const label = name(r);
        if (e.action === "resident.created") parts = [{ text: "added a new resident" }, ...(label ? [{ text: label, strong: true }] : [])];
        else if (kind === "checkout") parts = [{ text: "checked out" }, ...(label ? [{ text: label, strong: true }] : [])];
        else if (kind === "checkin") parts = [{ text: "checked in" }, ...(label ? [{ text: label, strong: true }] : [])];
        else parts = [{ text: `${verb} resident` }, ...(label ? [{ text: label, strong: true }] : [])];
        break;
      }
      case "ResidentAssignment": {
        const a = A.get(id);
        href = a ? `/residents/${a.residentId}` : null;
        const label = name(a?.resident);
        const room = a ? `Room ${a.room.roomNumber}` : null;
        if (kind === "checkout") parts = [{ text: "checked out" }, ...(label ? [{ text: label, strong: true }] : [])];
        else if (kind === "checkin") parts = [{ text: "checked in" }, ...(label ? [{ text: label, strong: true }] : []), ...(room ? [{ text: `to ${room}` }] : [])];
        else parts = [{ text: `${verb}` }, ...(label ? [{ text: label, strong: true }] : [])];
        break;
      }
      case "Complaint": {
        const c = C.get(id);
        href = c ? `/operations/complaints/${id}` : null;
        parts = [{ text: e.action === "complaint.created" ? "logged a new complaint" : `${verb} complaint` }, ...(c ? [{ text: c.title, strong: true }] : [])];
        break;
      }
      case "MaintenanceRequest": {
        const m = M.get(id);
        href = m ? `/operations/maintenance/${id}` : null;
        parts = [{ text: e.action === "maintenance.created" ? "opened a maintenance request" : `${verb} maintenance request` }, ...(m ? [{ text: m.title, strong: true }] : [])];
        break;
      }
      case "Staff": {
        const s = S.get(id);
        href = s ? `/staff/${id}` : null;
        const label = name(s);
        parts = [{ text: e.action === "staff.created" ? "added staff member" : `${verb} for` }, ...(label ? [{ text: label, strong: true }] : [])];
        break;
      }
      case "Visitor": {
        const v = V.get(id);
        href = "/operations/visitors";
        parts = [{ text: `${verb} visitor` }, ...(v ? [{ text: v.name, strong: true }] : [])];
        break;
      }
    }
    return { id: e.id, kind, actor: e.user?.name ?? null, parts, href, at: e.createdAt };
  });
}

/** Feed built from hostel-scoped tables (members restricted to some hostels). */
async function scopedFeed(ctx: TenantContext): Promise<ActivityItem[]> {
  const where = scopedWhere(ctx);
  const take = FEED_LIMIT;
  const none = Promise.resolve([]);
  const residentSelect = { firstName: true, lastName: true } satisfies Prisma.ResidentSelect;
  const [checkIns, checkOuts, payments, complaints, maintenance] = await Promise.all([
    can(ctx, "residents.view")
      ? prisma.residentAssignment.findMany({
          where: { ...where, status: { not: "CANCELLED" } },
          orderBy: { createdAt: "desc" },
          take,
          select: { id: true, residentId: true, createdAt: true, resident: { select: residentSelect }, room: { select: { roomNumber: true } }, createdBy: { select: { name: true } } },
        })
      : none,
    can(ctx, "residents.view")
      ? prisma.residentAssignment.findMany({
          where: { ...where, status: "COMPLETED" },
          orderBy: { updatedAt: "desc" },
          take,
          select: { id: true, residentId: true, updatedAt: true, resident: { select: residentSelect } },
        })
      : none,
    can(ctx, "payments.view")
      ? prisma.payment.findMany({
          where: { ...where, status: "COMPLETED", type: { in: ["PAYMENT", "REFUND"] } },
          orderBy: { createdAt: "desc" },
          take,
          select: { id: true, type: true, amount: true, createdAt: true, resident: { select: residentSelect }, receivedBy: { select: { name: true } } },
        })
      : none,
    can(ctx, "complaints.view")
      ? prisma.complaint.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take,
          select: { id: true, title: true, createdAt: true, submittedBy: { select: { name: true } }, resident: { select: residentSelect } },
        })
      : none,
    can(ctx, "maintenance.view")
      ? prisma.maintenanceRequest.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take,
          select: { id: true, title: true, createdAt: true, reportedBy: { select: { name: true } } },
        })
      : none,
  ]);
  const items: ActivityItem[] = [
    ...checkIns.map((a) => ({
      id: `in-${a.id}`,
      kind: "checkin" as const,
      actor: a.createdBy?.name ?? null,
      parts: [{ text: "checked in" }, { text: name(a.resident) ?? "a resident", strong: true }, { text: `to Room ${a.room.roomNumber}` }],
      href: `/residents/${a.residentId}`,
      at: a.createdAt,
    })),
    ...checkOuts.map((a) => ({
      id: `out-${a.id}`,
      kind: "checkout" as const,
      actor: null,
      parts: [{ text: name(a.resident) ?? "A resident", strong: true }, { text: "checked out" }],
      href: `/residents/${a.residentId}`,
      at: a.updatedAt,
    })),
    ...payments.map((p) => ({
      id: `pay-${p.id}`,
      kind: "payment" as const,
      actor: p.receivedBy?.name ?? null,
      parts:
        p.type === "REFUND"
          ? [{ text: "issued a refund of" }, { amount: round2(toNumber(p.amount)) }, { text: "to" }, { text: name(p.resident) ?? "a resident", strong: true }]
          : [{ text: "recorded a payment of" }, { amount: round2(toNumber(p.amount)) }, { text: "from" }, { text: name(p.resident) ?? "a resident", strong: true }],
      href: `/finance/payments/${p.id}`,
      at: p.createdAt,
    })),
    ...complaints.map((c) => ({
      id: `cmp-${c.id}`,
      kind: "complaint" as const,
      actor: c.submittedBy?.name ?? name(c.resident),
      parts: [{ text: "logged a new complaint" }, { text: c.title, strong: true }],
      href: `/operations/complaints/${c.id}`,
      at: c.createdAt,
    })),
    ...maintenance.map((m) => ({
      id: `mnt-${m.id}`,
      kind: "maintenance" as const,
      actor: m.reportedBy?.name ?? null,
      parts: [{ text: "opened a maintenance request" }, { text: m.title, strong: true }],
      href: `/operations/maintenance/${m.id}`,
      at: m.createdAt,
    })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, FEED_LIMIT);
}

export async function getRecentActivity(ctx: TenantContext): Promise<ActivityItem[]> {
  return ctx.allHostels && !ctx.activeHostelId ? auditFeed(ctx) : scopedFeed(ctx);
}
