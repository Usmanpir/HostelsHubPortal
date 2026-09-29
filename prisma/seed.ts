/**
 * Development seed. Builds a realistic demo tenant by calling the real
 * services, so every business rule (capacity, one resident per bed, invoice
 * numbering, audit logs…) holds exactly as in production.
 *
 *   npm run db:seed
 *
 * Demo credentials are documented in README.md (development only).
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { ensurePlans } from "@/lib/db/ensure-plans";
import { hashPassword } from "@/lib/auth/password";
import { loadTenantContext, type TenantContext } from "@/lib/tenant/context";
import { createOrganizationForUser } from "@/services/organization/organization-service";
import { createHostel } from "@/services/hostel/hostel-service";
import { bulkCreateRooms, createFloor, updateBed } from "@/services/hostel/structure-service";
import { createResident } from "@/services/resident/resident-service";
import { checkIn, checkOut, transfer } from "@/services/resident/assignment-service";
import { createStaff } from "@/services/staff/staff-service";
import { saveAttendance } from "@/services/staff/attendance-service";
import { createLeave, reviewLeave } from "@/services/staff/leave-service";
import { generatePayroll, payPayroll } from "@/services/staff/payroll-service";
import { createInvoice } from "@/services/finance/invoice-service";
import { recordPayment } from "@/services/finance/payment-service";
import { markOverdueInvoices } from "@/services/finance/ledger";
import { createExpense } from "@/services/finance/expense-service";
import { createMaintenance, updateMaintenanceStatus, assignMaintenance } from "@/services/operations/maintenance-service";
import { createComplaint, updateComplaintStatus } from "@/services/operations/complaint-service";
import { checkInVisitor, checkOutVisitor } from "@/services/operations/visitor-service";
import { createAnnouncement } from "@/services/operations/announcement-service";
import { todayInTimeZone } from "@/lib/format";
import { seedPropertyDemo } from "./seed-property-demo";

const PASSWORD = "Demo@12345";
const TZ = "Asia/Karachi";

// Deterministic pseudo-random numbers so every seed run looks the same.
let state = 42;
const rand = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)]!;

const FIRST = ["Ali", "Ahmed", "Hamza", "Usman", "Bilal", "Hassan", "Zain", "Saad", "Omar", "Faisal", "Imran", "Kashif", "Talha", "Hamid", "Waqas", "Asad", "Junaid", "Shoaib", "Adeel", "Fahad", "Danish", "Rizwan", "Salman", "Nabeel", "Arslan", "Haris", "Moiz", "Taimoor", "Shahzaib", "Yasir", "Farhan", "Sameer", "Aamir", "Owais", "Ehsan", "Kamran", "Raheel", "Noman", "Umair", "Zeeshan"];
const LAST = ["Khan", "Ahmed", "Malik", "Hussain", "Qureshi", "Butt", "Chaudhry", "Sheikh", "Raza", "Iqbal", "Mirza", "Abbasi", "Siddiqui", "Javed", "Aslam"];
const INSTITUTES = ["NUST", "COMSATS University", "FAST-NUCES", "Quaid-i-Azam University", "Riphah International", "Bahria University", "Air University", "Systems Ltd", "Jazz", "PTCL"];

async function user(email: string, name: string, extra: { isSuperAdmin?: boolean } = {}) {
  return prisma.user.create({
    data: { email, name, passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date(), isSuperAdmin: extra.isSuperAdmin ?? false },
  });
}

async function member(ctx: TenantContext, email: string, name: string, roleKey: string, hostelIds?: string[]) {
  const u = await user(email, name);
  const role = await prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: ctx.organizationId, key: roleKey } } });
  await prisma.organizationMember.create({
    data: {
      organizationId: ctx.organizationId,
      userId: u.id,
      roleId: role.id,
      allHostels: !hostelIds,
      hostelAccess: hostelIds ? { create: hostelIds.map((hostelId) => ({ hostelId })) } : undefined,
    },
  });
  return u;
}

async function context(userId: string, organizationId: string) {
  const ctx = await loadTenantContext(prisma, { userId, preferredOrganizationId: organizationId });
  if (!ctx) throw new Error("Could not build tenant context");
  return ctx;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 86400_000));

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed a production database.");
  await ensurePlans(prisma);

  if (await prisma.user.findUnique({ where: { email: "owner@demo-hostels.dev" } })) {
    console.log("Hostel demo data already present — skipping it.");
    await seedPropertyDemo();
    return;
  }

  const today = todayInTimeZone(TZ);
  const [year, month] = today.split("-").map(Number) as [number, number];
  const monthStart = (offset: number) => iso(new Date(Date.UTC(year, month - 1 + offset, 1)));

  console.log("→ Platform admin");
  await user("admin@hostelhub.dev", "Platform Admin", { isSuperAdmin: true });

  console.log("→ Organization");
  const owner = await user("owner@demo-hostels.dev", "Sara Owner");
  const org = await createOrganizationForUser(
    prisma,
    owner.id,
    { name: "Demo Hostel Management", email: "hello@demo-hostels.dev", phone: "+92 51 1234567", city: "Islamabad", country: "Pakistan", currency: "PKR", timezone: TZ },
    { planKey: "business" },
  );
  const business = await prisma.plan.findUniqueOrThrow({ where: { key: "business" } });
  await prisma.subscription.update({
    where: { organizationId: org.id },
    data: { planId: business.id, status: "ACTIVE", trialEndsAt: null, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86400_000) },
  });
  await prisma.organization.update({
    where: { id: org.id },
    data: { onboardingCompletedAt: new Date(), address: "Blue Area, Jinnah Avenue", invoiceFooter: "Thank you for staying with us. Please pay by the due date to avoid a late fee." },
  });
  let ctx = await context(owner.id, org.id);

  console.log("→ Hostels, floors, rooms, beds");
  const isb = await createHostel(ctx, {
    name: "Islamabad Boys Hostel", code: "ISB-BH", type: "BOYS", gender: "MALE", city: "Islamabad", country: "Pakistan",
    address: "Street 12, G-9/2", phone: "+92 51 2223344", defaultBedRent: 15000, defaultDeposit: 15000, admissionFee: 5000,
    amenities: ["Wi-Fi", "Laundry", "Mess", "Backup power", "CCTV"], rules: "Gate closes at 11:00 PM.\nVisitors allowed 10 AM – 8 PM in the lobby only.\nRent is due by the 5th of every month.",
    rentDueDay: 5, lateFeeAmount: 1000,
  });
  const rwp = await createHostel(ctx, {
    name: "Rawalpindi Hostel", code: "RWP-01", type: "STUDENT", gender: "MIXED", city: "Rawalpindi", country: "Pakistan",
    address: "Saddar, Bank Road", phone: "+92 51 5556677", defaultBedRent: 12000, defaultDeposit: 12000, admissionFee: 3000,
    amenities: ["Wi-Fi", "Study room", "Mess"], rules: "Quiet hours 10 PM – 7 AM.", rentDueDay: 5,
  });
  ctx = await context(owner.id, org.id);

  for (const [hostel, floors] of [[isb, 3], [rwp, 2]] as const) {
    for (let n = 0; n < floors; n++) {
      const floor = await createFloor(ctx, { hostelId: hostel.id, name: n === 0 ? "Ground Floor" : `${["First", "Second", "Third"][n - 1]} Floor`, floorNumber: n });
      const base = (n + 1) * 100;
      if (hostel.id === isb.id) {
        await bulkCreateRooms(ctx, { floorId: floor.id, startNumber: base + 1, count: 2, roomType: "FOUR_BED", capacity: 4, rent: 15000 });
        await bulkCreateRooms(ctx, { floorId: floor.id, startNumber: base + 3, count: 2, roomType: "DOUBLE", capacity: 2, rent: 20000 });
      } else {
        await bulkCreateRooms(ctx, { floorId: floor.id, startNumber: base + 1, count: 3, roomType: "TRIPLE", capacity: 3, rent: 12000 });
      }
    }
  }

  // Property existed before the first residents arrived (keeps occupancy trends realistic).
  const opened = new Date(`${monthStart(-7)}T00:00:00Z`);
  const backdate = { where: { organizationId: org.id }, data: { createdAt: opened } };
  await prisma.hostel.updateMany(backdate);
  await prisma.floor.updateMany(backdate);
  await prisma.room.updateMany(backdate);
  await prisma.bed.updateMany(backdate);

  console.log("→ Team members");
  await member(ctx, "manager@demo-hostels.dev", "Adnan Admin", "ADMIN");
  await member(ctx, "accounts@demo-hostels.dev", "Nadia Accountant", "ACCOUNTANT");
  await member(ctx, "islamabad.manager@demo-hostels.dev", "Kamran Manager", "HOSTEL_MANAGER", [isb.id]);
  await member(ctx, "reception@demo-hostels.dev", "Hina Reception", "RECEPTIONIST", [rwp.id]);
  const wardenUser = await member(ctx, "warden@demo-hostels.dev", "Tariq Warden", "WARDEN", [isb.id]);
  const staffUser = await member(ctx, "staff@demo-hostels.dev", "Rafiq Technician", "STAFF", [isb.id]);
  ctx = await context(owner.id, org.id);

  console.log("→ Staff");
  const staffDefs = [
    { firstName: "Kamran", lastName: "Manager", designation: "MANAGER", salary: 85000, hostelIds: [isb.id] },
    { firstName: "Tariq", lastName: "Warden", designation: "WARDEN", salary: 55000, hostelIds: [isb.id], userId: wardenUser.id },
    { firstName: "Hina", lastName: "Reception", designation: "RECEPTIONIST", salary: 45000, hostelIds: [rwp.id] },
    { firstName: "Rafiq", lastName: "Technician", designation: "MAINTENANCE", salary: 40000, hostelIds: [isb.id, rwp.id], userId: staffUser.id },
    { firstName: "Gul", lastName: "Khan", designation: "SECURITY_GUARD", salary: 35000, hostelIds: [isb.id] },
    { firstName: "Sajid", lastName: "Ali", designation: "COOK", salary: 38000, hostelIds: [isb.id] },
    { firstName: "Nasreen", lastName: "Bibi", designation: "CLEANER", salary: 30000, hostelIds: [rwp.id] },
    { firstName: "Imtiaz", lastName: "Ahmed", designation: "SECURITY_GUARD", salary: 35000, hostelIds: [rwp.id] },
  ] as const;
  const staff = [];
  for (const [i, s] of staffDefs.entries()) {
    staff.push(
      await createStaff(ctx, {
        ...s,
        hostelIds: [...s.hostelIds],
        primaryHostelId: s.hostelIds[0],
        phone: `+92 300 55500${String(i).padStart(2, "0")}`,
        joiningDate: "2025-11-01",
        employmentType: "FULL_TIME",
      }),
    );
  }
  await prisma.hostel.update({ where: { id: isb.id }, data: { managerStaffId: staff[0]!.id } });
  await prisma.hostel.update({ where: { id: rwp.id }, data: { managerStaffId: staff[2]!.id } });

  console.log("→ Residents and check-ins");
  const beds = await prisma.bed.findMany({
    where: { organizationId: org.id },
    orderBy: [{ hostelId: "asc" }, { room: { roomNumber: "asc" } }, { bedNumber: "asc" }],
    include: { room: { select: { rent: true } } },
  });
  const freeBeds = [...beds];
  const residents: { id: string; hostelId: string; assignedBedId?: string; checkInDate?: string; rent?: number }[] = [];
  const TOTAL_RESIDENTS = 38;
  for (let i = 0; i < TOTAL_RESIDENTS; i++) {
    const bed = i < 34 ? freeBeds.splice(Math.floor(rand() * freeBeds.length), 1)[0]! : null;
    const hostelId = bed?.hostelId ?? (i % 2 ? isb.id : rwp.id);
    const checkInDate = addDays(monthStart(-6), Math.floor(rand() * 150));
    const firstName = FIRST[i % FIRST.length]!;
    const lastName = pick(LAST);
    const resident = await createResident(ctx, {
      hostelId,
      firstName,
      lastName,
      phone: `+92 3${10 + (i % 40)} ${String(1000000 + i * 7919).slice(0, 7)}`,
      email: i === 0 ? "resident@demo-hostels.dev" : `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
      gender: "MALE",
      idNumber: `61101-${String(1000000 + i * 1237).slice(0, 7)}-${i % 10}`,
      nationality: "Pakistani",
      city: pick(["Lahore", "Multan", "Peshawar", "Faisalabad", "Quetta", "Abbottabad", "Sialkot"]),
      occupation: i % 3 === 0 ? "Software engineer" : "Student",
      institution: pick(INSTITUTES),
      joiningDate: checkInDate,
      emergencyContactName: `${pick(FIRST)} ${lastName}`,
      emergencyContactPhone: `+92 321 ${String(5000000 + i * 311).slice(0, 7)}`,
      emergencyContactRelation: pick(["Father", "Brother", "Uncle"]),
    });
    const entry: (typeof residents)[number] = { id: resident.id, hostelId };
    if (bed) {
      const rent = Number(bed.room.rent ?? 15000);
      await checkIn(ctx, { residentId: resident.id, bedId: bed.id, checkInDate, monthlyRent: rent, securityDeposit: rent, notes: "Seeded check-in" });
      Object.assign(entry, { assignedBedId: bed.id, checkInDate, rent });
    }
    residents.push(entry);
  }

  // A portal login for the first resident.
  const residentUser = await user("resident@demo-hostels.dev", "Ali Khan");
  await prisma.resident.update({ where: { id: residents[0]!.id }, data: { userId: residentUser.id, firstName: "Ali", lastName: "Khan" } });

  // History: a transfer and a few check-outs (freeing their beds).
  const inIsb = residents.filter((r) => r.assignedBedId && r.hostelId === isb.id);
  const spareIsbBed = freeBeds.find((b) => b.hostelId === isb.id);
  if (spareIsbBed && inIsb[1]) {
    await transfer(ctx, { residentId: inIsb[1].id, toBedId: spareIsbBed.id, transferDate: addDays(today, -20), monthlyRent: Number(spareIsbBed.room.rent ?? 15000), notes: "Requested a quieter room" });
    freeBeds.splice(freeBeds.indexOf(spareIsbBed), 1);
    inIsb[1].rent = Number(spareIsbBed.room.rent ?? 15000);
  }
  for (const r of residents.filter((x) => x.assignedBedId).slice(-3)) {
    await checkOut(ctx, {
      residentId: r.id,
      checkOutDate: addDays(today, -Math.floor(5 + rand() * 20)),
      depositDeduction: 2000,
      depositRefund: (r.rent ?? 15000) - 2000,
      refundMethod: "BANK_TRANSFER",
      endReason: "Completed studies",
      meterReading: "12450",
    });
    r.assignedBedId = undefined;
  }
  // Take one free bed out of service.
  const maintenanceBed = freeBeds.find((b) => b.hostelId === rwp.id);
  if (maintenanceBed) await updateBed(ctx, maintenanceBed.id, { bedNumber: maintenanceBed.bedNumber, status: "MAINTENANCE", notes: "Broken bed frame" });

  console.log("→ Invoices and payments");
  const active = await prisma.residentAssignment.findMany({ where: { organizationId: org.id, status: "ACTIVE" }, select: { residentId: true, checkInDate: true, monthlyRent: true, id: true } });
  for (let offset = -2; offset <= 0; offset++) {
    const periodStart = monthStart(offset);
    const periodEnd = addDays(monthStart(offset + 1), -1);
    for (const a of active) {
      if (iso(a.checkInDate) > periodEnd) continue;
      const withBills = rand() > 0.5;
      const invoice = await createInvoice(ctx, {
        residentId: a.residentId,
        assignmentId: a.id,
        issueDate: periodStart,
        dueDate: addDays(periodStart, 9),
        periodStart,
        periodEnd,
        applyTax: false,
        items: [
          { type: "MONTHLY_RENT", description: `Rent for ${periodStart.slice(0, 7)}`, quantity: 1, unitPrice: Number(a.monthlyRent) },
          ...(withBills ? [{ type: "ELECTRICITY" as const, description: "Electricity share", quantity: 1, unitPrice: 1500 + Math.round(rand() * 1500) }] : []),
        ],
      });
      const roll = rand();
      const paidInFull = offset < 0 ? roll > 0.1 : roll > 0.45;
      const partial = !paidInFull && roll > (offset < 0 ? 0.05 : 0.25);
      if (paidInFull || partial) {
        await recordPayment(ctx, {
          residentId: a.residentId,
          invoiceId: invoice.id,
          amount: paidInFull ? invoice.total : Math.round(invoice.total / 2),
          method: pick(["CASH", "BANK_TRANSFER", "BANK_TRANSFER", "ONLINE"] as const),
          reference: rand() > 0.5 ? `TRX${Math.floor(rand() * 1e8)}` : undefined,
          paymentDate: addDays(periodStart, 2 + Math.floor(rand() * 8)),
        });
      }
    }
  }
  await markOverdueInvoices(org.id, TZ);

  console.log("→ Expenses");
  const categories = await prisma.expenseCategory.findMany({ where: { organizationId: org.id } });
  const cat = (key: string) => categories.find((c) => c.key === key)!.id;
  for (let offset = -2; offset <= 0; offset++) {
    for (const hostel of [isb, rwp]) {
      const scale = hostel.id === isb.id ? 1 : 0.7;
      const base = monthStart(offset);
      const items = [
        ["electricity", 45000, "IESCO", "Monthly electricity bill"],
        ["gas", 18000, "SNGPL", "Gas bill"],
        ["internet", 12000, "Nayatel", "Fiber internet"],
        ["food", 70000, "Metro Cash & Carry", "Mess groceries"],
        ["cleaning", 9000, "CleanPro", "Cleaning supplies"],
        ["maintenance", 15000, "Local contractor", "Plumbing and repairs"],
      ] as const;
      for (const [key, amount, vendor, description] of items) {
        const date = addDays(base, 3 + Math.floor(rand() * 20));
        if (date > today) continue;
        await createExpense(ctx, { hostelId: hostel.id, categoryId: cat(key), amount: Math.round(amount * scale * (0.85 + rand() * 0.3)), date, vendor, description, paymentMethod: "BANK_TRANSFER" });
      }
    }
  }

  console.log("→ Attendance, leave and payroll");
  const statuses = ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "LATE", "PRESENT", "ABSENT", "HALF_DAY"] as const;
  for (let d = 13; d >= 0; d--) {
    const date = addDays(today, -d);
    await saveAttendance(ctx, {
      date,
      entries: staff.map((s) => {
        const status = pick(statuses);
        return { staffId: s.id, status, checkInTime: status === "ABSENT" ? undefined : status === "LATE" ? "09:40" : "09:00", checkOutTime: status === "ABSENT" ? undefined : status === "HALF_DAY" ? "13:00" : "17:00" };
      }),
    });
  }
  const leave = await createLeave(ctx, { staffId: staff[5]!.id, type: "SICK", startDate: addDays(today, -40), endDate: addDays(today, -38), reason: "Fever" });
  await reviewLeave(ctx, leave.id, { decision: "APPROVED" });
  await createLeave(ctx, { staffId: staff[4]!.id, type: "ANNUAL", startDate: addDays(today, 10), endDate: addDays(today, 14), reason: "Family wedding" });

  const prev = new Date(Date.UTC(year, month - 2, 1));
  await generatePayroll(ctx, { year: prev.getUTCFullYear(), month: prev.getUTCMonth() + 1 });
  for (const p of await prisma.payroll.findMany({ where: { organizationId: org.id, year: prev.getUTCFullYear(), month: prev.getUTCMonth() + 1 } })) {
    await payPayroll(ctx, p.id, { paymentDate: addDays(monthStart(0), 1), paymentMethod: "BANK_TRANSFER", reference: `SAL-${p.month}-${p.staffId.slice(-4)}` });
  }
  await generatePayroll(ctx, { year, month });

  console.log("→ Maintenance, complaints, visitors, announcements");
  const occupied = residents.filter((r) => r.assignedBedId);
  const bedInfo = async (bedId: string) => prisma.bed.findUniqueOrThrow({ where: { id: bedId }, select: { roomId: true, hostelId: true } });
  const technician = staff[3]!;
  const maintenanceDefs = [
    { category: "PLUMBING", priority: "HIGH", title: "Leaking tap in bathroom", status: "IN_PROGRESS" },
    { category: "ELECTRICITY", priority: "URGENT", title: "Power socket sparking", status: "ASSIGNED" },
    { category: "AC", priority: "MEDIUM", title: "AC not cooling", status: "OPEN" },
    { category: "FURNITURE", priority: "LOW", title: "Wardrobe door hinge broken", status: "COMPLETED" },
    { category: "INTERNET", priority: "MEDIUM", title: "Wi-Fi drops on second floor", status: "OPEN" },
    { category: "WATER", priority: "HIGH", title: "No hot water in the morning", status: "COMPLETED" },
  ] as const;
  for (const [i, m] of maintenanceDefs.entries()) {
    const r = occupied[i * 3]!;
    const b = await bedInfo(r.assignedBedId!);
    const request = await createMaintenance(ctx, { hostelId: b.hostelId, roomId: b.roomId, bedId: r.assignedBedId, residentId: r.id, category: m.category, priority: m.priority, title: m.title, description: `${m.title}. Reported by the resident.` });
    if (m.status !== "OPEN") {
      await assignMaintenance(ctx, request.id, { assignedStaffId: technician.id });
      if (m.status === "IN_PROGRESS" || m.status === "COMPLETED") await updateMaintenanceStatus(ctx, request.id, { status: "IN_PROGRESS", notes: "Inspected, parts ordered" });
      if (m.status === "COMPLETED") await updateMaintenanceStatus(ctx, request.id, { status: "COMPLETED", notes: "Fixed and tested" });
    }
  }
  const complaintDefs = [
    { category: "FOOD", title: "Dinner quality has dropped", status: "UNDER_REVIEW" },
    { category: "NOISE", title: "Loud music after midnight in room 203", status: "RESOLVED" },
    { category: "CLEANLINESS", title: "Washrooms not cleaned on Sunday", status: "OPEN" },
    { category: "BILLING", title: "Electricity share looks too high", status: "IN_PROGRESS" },
    { category: "SECURITY", title: "Main gate left open at night", status: "OPEN" },
  ] as const;
  for (const [i, c] of complaintDefs.entries()) {
    const r = occupied[i * 2 + 1]!;
    const complaint = await createComplaint(ctx, { hostelId: r.hostelId, residentId: r.id, category: c.category, priority: i === 4 ? "HIGH" : "MEDIUM", title: c.title, description: `${c.title}. Please look into this.` });
    if (c.status !== "OPEN") {
      if (c.status === "RESOLVED") await updateComplaintStatus(ctx, complaint.id, { status: "IN_PROGRESS" });
      await updateComplaintStatus(ctx, complaint.id, { status: c.status, resolution: c.status === "RESOLVED" ? "Spoke with the residents involved; issue resolved." : undefined });
    }
  }
  const visitorNames = ["Muhammad Akram", "Shazia Parveen", "Irfan Ullah", "Naveed Anjum", "Rukhsana Begum", "Khalid Mehmood", "Asma Noor", "Javed Iqbal"];
  for (const [i, name] of visitorNames.entries()) {
    const r = occupied[i]!;
    const v = await checkInVisitor(ctx, { hostelId: r.hostelId, name, phone: `+92 333 ${String(4400000 + i * 97).slice(0, 7)}`, residentId: r.id, purpose: pick(["Family visit", "Dropping off belongings", "Friend visit"]) });
    if (i > 2) await checkOutVisitor(ctx, v.id);
  }
  await createAnnouncement(ctx, { title: "Rent due by the 5th", body: "A reminder that this month's rent is due by the 5th. A late fee applies after the grace period.", category: "RENT_REMINDER", audience: "RESIDENTS", isPinned: true });
  await createAnnouncement(ctx, { title: "Water shutdown on Saturday", body: "Water supply will be off from 10 AM to 2 PM on Saturday for tank cleaning.", category: "MAINTENANCE", audience: "EVERYONE", hostelId: isb.id });
  await createAnnouncement(ctx, { title: "Staff meeting", body: "All staff: monthly meeting on Monday at 9 AM in the common room.", category: "GENERAL", audience: "STAFF" });

  console.log("→ Second tenant (isolation checks)");
  const otherOwner = await user("owner@other-tenant.dev", "Omar Other");
  const otherOrg = await createOrganizationForUser(prisma, otherOwner.id, { name: "Northern Lodges", city: "Lahore", country: "Pakistan", currency: "PKR", timezone: TZ });
  await prisma.organization.update({ where: { id: otherOrg.id }, data: { onboardingCompletedAt: new Date() } });
  let otherCtx = await context(otherOwner.id, otherOrg.id);
  const lhr = await createHostel(otherCtx, { name: "Lahore Hostel", code: "LHR-01", city: "Lahore", defaultBedRent: 14000 });
  otherCtx = await context(otherOwner.id, otherOrg.id);
  const lhrFloor = await createFloor(otherCtx, { hostelId: lhr.id, name: "Ground Floor", floorNumber: 0 });
  await bulkCreateRooms(otherCtx, { floorId: lhrFloor.id, startNumber: 1, count: 2, capacity: 2, rent: 14000 });
  await createResident(otherCtx, { hostelId: lhr.id, firstName: "Private", lastName: "Resident", phone: "+92 300 9999999", joiningDate: monthStart(-1) });

  await seedPropertyDemo();
  console.log(`\n✓ Seed complete. Sign in with any demo account (password: ${PASSWORD}) — see README.md.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
