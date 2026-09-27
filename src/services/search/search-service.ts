import { prisma } from "@/lib/db/prisma";
import { accessWhere, can, type TenantContext } from "@/lib/tenant/context";
import { fullName } from "@/lib/format";

export type SearchResult = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

export type SearchGroup = { key: string; label: string; results: SearchResult[] };

const LIMIT = 5;

/**
 * Global search across modules the member is permitted to see. Each query is
 * tenant- and hostel-scoped; categories the user lacks permission for are
 * skipped entirely.
 */
export async function globalSearch(ctx: TenantContext, rawQuery: string): Promise<SearchGroup[]> {
  const q = rawQuery.trim().slice(0, 80);
  if (q.length < 2) return [];
  const contains = { contains: q, mode: "insensitive" as const };
  const scope = accessWhere(ctx);
  const tasks: Promise<SearchGroup | null>[] = [];

  if (can(ctx, "residents.view")) {
    tasks.push(
      prisma.resident
        .findMany({
          where: {
            ...scope,
            OR: [
              { firstName: contains },
              { lastName: contains },
              { residentCode: contains },
              { phone: contains },
              { email: contains },
              { idNumber: contains },
            ],
          },
          take: LIMIT,
          orderBy: { updatedAt: "desc" },
          select: { id: true, firstName: true, lastName: true, residentCode: true, phone: true, status: true },
        })
        .then((rows) => ({
          key: "residents",
          label: "Residents",
          results: rows.map((r) => ({
            id: r.id,
            title: fullName(r),
            subtitle: `${r.residentCode} · ${r.phone}`,
            href: `/residents/${r.id}`,
          })),
        })),
    );
  }

  if (can(ctx, "staff.view")) {
    tasks.push(
      prisma.staff
        .findMany({
          where: {
            organizationId: ctx.organizationId,
            archivedAt: null,
            OR: [{ firstName: contains }, { lastName: contains }, { employeeCode: contains }, { phone: contains }],
            ...(ctx.allHostels ? {} : { hostels: { some: { hostelId: { in: ctx.accessibleHostelIds } } } }),
          },
          take: LIMIT,
          select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true },
        })
        .then((rows) => ({
          key: "staff",
          label: "Staff",
          results: rows.map((s) => ({ id: s.id, title: fullName(s), subtitle: s.employeeCode, href: `/staff/${s.id}` })),
        })),
    );
  }

  if (can(ctx, "rooms.view")) {
    tasks.push(
      prisma.room
        .findMany({
          where: { ...scope, archivedAt: null, roomNumber: contains },
          take: LIMIT,
          select: { id: true, roomNumber: true, hostel: { select: { name: true } }, floor: { select: { name: true } } },
        })
        .then((rows) => ({
          key: "rooms",
          label: "Rooms",
          results: rows.map((r) => ({
            id: r.id,
            title: `Room ${r.roomNumber}`,
            subtitle: `${r.hostel.name} · ${r.floor.name}`,
            href: `/hostels/rooms/${r.id}`,
          })),
        })),
    );
    tasks.push(
      prisma.bed
        .findMany({
          where: {
            ...scope,
            archivedAt: null,
            OR: [{ bedNumber: contains }, { room: { roomNumber: contains } }],
          },
          take: LIMIT,
          select: { id: true, bedNumber: true, status: true, roomId: true, room: { select: { roomNumber: true, hostel: { select: { name: true } } } } },
        })
        .then((rows) => ({
          key: "beds",
          label: "Beds",
          results: rows.map((b) => ({
            id: b.id,
            title: `Room ${b.room.roomNumber} · Bed ${b.bedNumber}`,
            subtitle: `${b.room.hostel.name} · ${b.status.toLowerCase()}`,
            href: `/hostels/rooms/${b.roomId}`,
          })),
        })),
    );
  }

  if (can(ctx, "invoices.view")) {
    tasks.push(
      prisma.invoice
        .findMany({
          where: {
            ...scope,
            OR: [
              { invoiceNumber: contains },
              { resident: { OR: [{ firstName: contains }, { lastName: contains }] } },
            ],
          },
          take: LIMIT,
          orderBy: { issueDate: "desc" },
          select: { id: true, invoiceNumber: true, status: true, resident: { select: { firstName: true, lastName: true } } },
        })
        .then((rows) => ({
          key: "invoices",
          label: "Invoices",
          results: rows.map((i) => ({
            id: i.id,
            title: i.invoiceNumber,
            subtitle: `${fullName(i.resident)} · ${i.status.toLowerCase().replace("_", " ")}`,
            href: `/finance/invoices/${i.id}`,
          })),
        })),
    );
  }

  if (can(ctx, "payments.view")) {
    tasks.push(
      prisma.payment
        .findMany({
          where: {
            ...scope,
            OR: [
              { receiptNumber: contains },
              { reference: contains },
              { resident: { OR: [{ firstName: contains }, { lastName: contains }] } },
            ],
          },
          take: LIMIT,
          orderBy: { paymentDate: "desc" },
          select: { id: true, receiptNumber: true, resident: { select: { firstName: true, lastName: true } } },
        })
        .then((rows) => ({
          key: "payments",
          label: "Payments",
          results: rows.map((p) => ({
            id: p.id,
            title: p.receiptNumber,
            subtitle: fullName(p.resident),
            href: `/finance/payments/${p.id}`,
          })),
        })),
    );
  }

  if (can(ctx, "complaints.view")) {
    tasks.push(
      prisma.complaint
        .findMany({
          where: { ...scope, OR: [{ complaintNumber: contains }, { title: contains }] },
          take: LIMIT,
          orderBy: { createdAt: "desc" },
          select: { id: true, complaintNumber: true, title: true },
        })
        .then((rows) => ({
          key: "complaints",
          label: "Complaints",
          results: rows.map((c) => ({ id: c.id, title: c.title, subtitle: c.complaintNumber, href: `/operations/complaints/${c.id}` })),
        })),
    );
  }

  if (can(ctx, "maintenance.view")) {
    tasks.push(
      prisma.maintenanceRequest
        .findMany({
          where: { ...scope, OR: [{ requestNumber: contains }, { title: contains }] },
          take: LIMIT,
          orderBy: { createdAt: "desc" },
          select: { id: true, requestNumber: true, title: true },
        })
        .then((rows) => ({
          key: "maintenance",
          label: "Maintenance",
          results: rows.map((m) => ({ id: m.id, title: m.title, subtitle: m.requestNumber, href: `/operations/maintenance/${m.id}` })),
        })),
    );
  }

  const groups = await Promise.all(tasks);
  return groups.filter((g): g is SearchGroup => !!g && g.results.length > 0);
}
