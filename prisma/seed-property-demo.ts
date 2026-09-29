/**
 * Demo data for the property-management and real-estate modules: a second
 * organization ("Demo Property Group") with whole-unit apartments, a house and
 * shops on leases, landlords, listings, leads, a viewing and deals.
 *
 * Runs as part of `npm run db:seed`, and on its own against an existing
 * database:  npx tsx --conditions=react-server prisma/seed-property-demo.ts
 */
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/db/prisma";
import { ensurePlans } from "@/lib/db/ensure-plans";
import { hashPassword } from "@/lib/auth/password";
import { loadTenantContext, type TenantContext } from "@/lib/tenant/context";
import { createOrganizationForUser } from "@/services/organization/organization-service";
import { createHostel } from "@/services/hostel/hostel-service";
import { createFloor, createRoom } from "@/services/hostel/structure-service";
import { createResident } from "@/services/resident/resident-service";
import { checkIn } from "@/services/resident/assignment-service";
import { createInvoice } from "@/services/finance/invoice-service";
import { recordPayment } from "@/services/finance/payment-service";
import { markOverdueInvoices } from "@/services/finance/ledger";
import { createExpense } from "@/services/finance/expense-service";
import { createOwner } from "@/services/owners/owner-service";
import { changeListingStatus, createListing, setListingPublished } from "@/services/real-estate/listing-service";
import { addLeadActivity, createLead } from "@/services/real-estate/lead-service";
import { scheduleViewing } from "@/services/real-estate/viewing-service";
import { changeDealStage, createDeal } from "@/services/real-estate/deal-service";
import { todayInTimeZone } from "@/lib/format";

const PASSWORD = "Demo@12345";
const TZ = "Asia/Karachi";
const OWNER_EMAIL = "property@demo-rentals.dev";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 86400_000));
const addMonths = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return iso(d);
};

async function context(userId: string, organizationId: string): Promise<TenantContext> {
  const ctx = await loadTenantContext(prisma, { userId, preferredOrganizationId: organizationId });
  if (!ctx) throw new Error("Could not build tenant context");
  return ctx;
}

export async function seedPropertyDemo() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed a production database.");
  await ensurePlans(prisma);
  if (await prisma.user.findUnique({ where: { email: OWNER_EMAIL } })) {
    console.log("Property demo already present — skipping.");
    return;
  }
  const today = todayInTimeZone(TZ);
  const monthStart = (offset: number) => {
    const [y, m] = today.split("-").map(Number) as [number, number];
    return iso(new Date(Date.UTC(y, m - 1 + offset, 1)));
  };

  console.log("→ Property demo: organization");
  const owner = await prisma.user.create({
    data: { email: OWNER_EMAIL, name: "Faisal Mahmood", passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() },
  });
  const org = await createOrganizationForUser(
    prisma,
    owner.id,
    { name: "Demo Property Group", email: "hello@demo-rentals.dev", phone: "+92 42 3577 1234", city: "Lahore", country: "Pakistan", currency: "PKR", timezone: TZ },
    { planKey: "business" },
  );
  const business = await prisma.plan.findUniqueOrThrow({ where: { key: "business" } });
  await prisma.subscription.update({
    where: { organizationId: org.id },
    data: { planId: business.id, status: "ACTIVE", trialEndsAt: null, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86400_000) },
  });
  await prisma.organization.update({
    where: { id: org.id },
    data: {
      businessType: "MIXED",
      ownersEnabled: true,
      dealerEnabled: true,
      publicListingsEnabled: true,
      publicProfileIntro: "Apartments, family homes and shops for rent and sale across Lahore. Verified listings, transparent paperwork.",
      address: "Main Boulevard, Gulberg III",
      onboardingCompletedAt: new Date(),
    },
  });
  let ctx = await context(owner.id, org.id);

  const agentUser = await prisma.user.create({
    data: { email: "agent@demo-rentals.dev", name: "Sana Tariq", passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() },
  });
  const agentRole = await prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org.id, key: "AGENT" } } });
  await prisma.organizationMember.create({ data: { organizationId: org.id, userId: agentUser.id, roleId: agentRole.id, allHostels: true } });

  console.log("→ Property demo: owners and properties");
  const nasreen = await createOwner(ctx, {
    name: "Nasreen Akhtar",
    phone: "+92 300 4455667",
    email: "nasreen.akhtar@example.com",
    bankName: "Meezan Bank",
    bankAccountTitle: "Nasreen Akhtar",
    bankAccountNumber: "PK36MEZN0001234567890123",
    commissionPercent: 8,
  });
  const kamal = await createOwner(ctx, { name: "Kamal Hussain", phone: "+92 321 9988776", commissionPercent: 10, bankName: "HBL", bankAccountTitle: "Kamal Hussain", bankAccountNumber: "PK12HABB0009876543210987" });

  const heights = await createHostel(ctx, {
    name: "Gulberg Heights",
    code: "GLB-H",
    kind: "APARTMENT_BUILDING",
    rentalMode: "WHOLE_UNIT",
    city: "Lahore",
    country: "Pakistan",
    address: "12-C, Gulberg III",
    ownerId: nasreen.id,
    defaultBedRent: 75000,
    defaultDeposit: 150000,
    rentDueDay: 5,
    amenities: ["Lift", "Backup generator", "Parking", "Security"],
  });
  const house = await createHostel(ctx, {
    name: "DHA Phase 6 — House 14",
    code: "DHA-14",
    kind: "HOUSE",
    rentalMode: "WHOLE_UNIT",
    city: "Lahore",
    country: "Pakistan",
    address: "House 14, Street 7, DHA Phase 6",
    ownerId: kamal.id,
    managementFeePercent: 7.5,
    defaultBedRent: 180000,
    defaultDeposit: 360000,
  });
  const shops = await createHostel(ctx, {
    name: "Liberty Market Shops",
    code: "LIB-S",
    kind: "COMMERCIAL",
    rentalMode: "WHOLE_UNIT",
    city: "Lahore",
    country: "Pakistan",
    address: "Liberty Market, Gulberg",
    ownerId: nasreen.id,
    defaultBedRent: 120000,
    defaultDeposit: 360000,
  });
  ctx = await context(owner.id, org.id);
  const opened = new Date(`${monthStart(-8)}T00:00:00Z`);
  const backdate = { where: { organizationId: org.id }, data: { createdAt: opened } };

  const units: { id: string; hostelId: string; rent: number }[] = [];
  for (let f = 1; f <= 3; f++) {
    const floor = await createFloor(ctx, { hostelId: heights.id, name: `${["First", "Second", "Third"][f - 1]} Floor`, floorNumber: f });
    for (let n = 1; n <= 4; n++) {
      const rent = 65000 + f * 5000 + (n % 2) * 5000;
      const room = await createRoom(ctx, {
        floorId: floor.id,
        roomNumber: `${f}0${n}`,
        roomType: "APARTMENT",
        capacity: 1,
        rent,
        bedrooms: n % 2 ? 3 : 2,
        bathrooms: n % 2 ? 3 : 2,
        areaSqft: n % 2 ? 1650 : 1250,
        furnished: n === 4,
      });
      units.push({ id: room.id, hostelId: heights.id, rent });
    }
  }
  const houseFloor = await createFloor(ctx, { hostelId: house.id, name: "Ground Floor", floorNumber: 0 });
  const houseMain = await createRoom(ctx, { floorId: houseFloor.id, roomNumber: "Main", roomType: "HOUSE", capacity: 1, rent: 180000, bedrooms: 4, bathrooms: 5, areaSqft: 4500 });
  const houseUpper = await createRoom(ctx, { floorId: houseFloor.id, roomNumber: "Upper portion", roomType: "PORTION", capacity: 1, rent: 95000, bedrooms: 2, bathrooms: 2, areaSqft: 1800 });
  units.push({ id: houseMain.id, hostelId: house.id, rent: 180000 }, { id: houseUpper.id, hostelId: house.id, rent: 95000 });
  const shopFloor = await createFloor(ctx, { hostelId: shops.id, name: "Ground Floor", floorNumber: 0 });
  for (let n = 1; n <= 4; n++) {
    const rent = 110000 + n * 10000;
    const room = await createRoom(ctx, { floorId: shopFloor.id, roomNumber: `S-${n}`, roomType: "SHOP", capacity: 1, rent, areaSqft: 350 + n * 50 });
    units.push({ id: room.id, hostelId: shops.id, rent });
  }
  await prisma.hostel.updateMany(backdate);
  await prisma.floor.updateMany(backdate);
  await prisma.room.updateMany(backdate);
  await prisma.bed.updateMany(backdate);

  console.log("→ Property demo: tenants and leases");
  const tenants = [
    ["Ahsan", "Qureshi", "Software architect"],
    ["Mehwish", "Rana", "Doctor"],
    ["Bilal", "Chaudhry", "Banker"],
    ["Hira", "Sheikh", "Architect"],
    ["Usman", "Ghani", "Business owner"],
    ["Ayesha", "Malik", "Consultant"],
    ["Rehan", "Butt", "Engineer"],
    ["Zara", "Iqbal", "Designer"],
    ["Chai Point", "Pvt Ltd", "Café"],
    ["Style Hub", "Clothing", "Retail"],
    ["Mobile Zone", "Traders", "Electronics"],
  ] as const;
  // Occupy most units, leaving some vacant for rent listings.
  const occupiedUnits = [0, 1, 2, 4, 5, 6, 8, 9, 12, 14, 15];
  const residentIds: string[] = [];
  for (const [i, unitIndex] of occupiedUnits.entries()) {
    const unit = units[unitIndex]!;
    const [firstName, lastName, occupation] = tenants[i]!;
    const moveIn = addDays(monthStart(-7), i * 9);
    // Two leases end soon so the "expiring" reminders and filters have data.
    const leaseEnd = i === 1 ? addDays(today, 18) : i === 5 ? addDays(today, 6) : addDays(addMonths(moveIn, 12), -1);
    const resident = await createResident(ctx, {
      hostelId: unit.hostelId,
      firstName,
      lastName,
      phone: `+92 333 ${String(4100000 + i * 1311).slice(0, 7)}`,
      email: `${firstName.toLowerCase().replace(/\W+/g, "")}.${i}@example.com`,
      occupation,
      joiningDate: moveIn,
      city: "Lahore",
    });
    const bed = await prisma.bed.findFirstOrThrow({ where: { roomId: unit.id } });
    await checkIn(ctx, {
      residentId: resident.id,
      bedId: bed.id,
      checkInDate: moveIn,
      monthlyRent: unit.rent,
      securityDeposit: unit.rent * 2,
      leaseEndDate: leaseEnd,
      noticePeriodDays: 30,
      advanceRent: unit.rent,
      rentIncrementPercent: 10,
      incrementIntervalMonths: 12,
      leaseTerms: "Rent due by the 5th. 10% annual increase. One month notice before vacating.",
    });
    residentIds.push(resident.id);
  }

  console.log("→ Property demo: rent invoices and payments");
  const active = await prisma.residentAssignment.findMany({ where: { organizationId: org.id, status: "ACTIVE" }, select: { id: true, residentId: true, monthlyRent: true, checkInDate: true } });
  for (let offset = -2; offset <= 0; offset++) {
    const periodStart = monthStart(offset);
    const periodEnd = addDays(monthStart(offset + 1), -1);
    for (const [i, a] of active.entries()) {
      if (iso(a.checkInDate) > periodEnd) continue;
      const invoice = await createInvoice(ctx, {
        residentId: a.residentId,
        assignmentId: a.id,
        issueDate: periodStart,
        dueDate: addDays(periodStart, 4),
        periodStart,
        periodEnd,
        applyTax: false,
        items: [{ type: "MONTHLY_RENT", description: `Rent for ${periodStart.slice(0, 7)}`, quantity: 1, unitPrice: Number(a.monthlyRent) }],
      });
      const unpaid = offset === 0 && i % 4 === 0;
      if (!unpaid) {
        await recordPayment(ctx, {
          residentId: a.residentId,
          invoiceId: invoice.id,
          amount: invoice.total,
          method: i % 2 ? "BANK_TRANSFER" : "ONLINE",
          reference: `IBFT-${periodStart.slice(0, 7)}-${i}`,
          paymentDate: addDays(periodStart, 2 + (i % 4)),
        });
      }
    }
  }
  await markOverdueInvoices(org.id, TZ);
  const maintenanceCategory = await prisma.expenseCategory.findFirstOrThrow({ where: { organizationId: org.id, key: "maintenance" } });
  await createExpense(ctx, { hostelId: heights.id, categoryId: maintenanceCategory.id, amount: 42000, date: addDays(monthStart(-1), 12), vendor: "Otis Elevators", description: "Lift servicing" });
  await createExpense(ctx, { hostelId: house.id, categoryId: maintenanceCategory.id, amount: 18500, date: addDays(monthStart(-1), 20), vendor: "Local plumber", description: "Water tank repair" });

  console.log("→ Property demo: listings, leads, viewings and deals");
  const vacantUnit = units[3]!; // Gulberg Heights 104
  const vacantShop = units[16]!; // Shop S-3 (units: 0–11 apartments, 12–13 house, 14–17 shops)
  const rentFlat = await createListing(ctx, {
    title: "2-bed furnished apartment, Gulberg Heights",
    purpose: "RENT",
    propertyType: "APARTMENT",
    price: 85000,
    areaValue: 1250,
    areaUnit: "SQFT",
    bedrooms: 2,
    bathrooms: 2,
    furnished: true,
    locality: "Gulberg III",
    city: "Lahore",
    description: "Fully furnished corner apartment with lift, generator backup and covered parking. Walking distance to Liberty Market.",
    features: ["Furnished", "Lift", "Parking", "Generator"],
    hostelId: heights.id,
    roomId: vacantUnit.id,
    ownerId: nasreen.id,
    agentUserId: agentUser.id,
  });
  const rentShop = await createListing(ctx, {
    title: "Ground-floor shop in Liberty Market",
    purpose: "RENT",
    propertyType: "SHOP",
    price: 130000,
    areaValue: 450,
    areaUnit: "SQFT",
    locality: "Liberty Market",
    city: "Lahore",
    description: "High footfall shop on the main walkway. Suitable for clothing, cafés or electronics.",
    features: ["Main road", "Glass front"],
    hostelId: shops.id,
    roomId: vacantShop.id,
    ownerId: nasreen.id,
    agentUserId: agentUser.id,
  });
  const saleHouse = await createListing(ctx, {
    title: "10 Marla modern house, DHA Phase 5",
    purpose: "SALE",
    propertyType: "HOUSE",
    price: 45_000_000,
    priceNegotiable: true,
    areaValue: 10,
    areaUnit: "MARLA",
    bedrooms: 5,
    bathrooms: 6,
    locality: "DHA Phase 5",
    city: "Lahore",
    description: "Brand new double-storey house with basement, solar system and a lawn. Near park and mosque.",
    features: ["Solar", "Basement", "Lawn", "Servant quarter"],
    agentUserId: agentUser.id,
  });
  const salePlot = await createListing(ctx, {
    title: "1 Kanal residential plot, Bahria Town",
    purpose: "SALE",
    propertyType: "PLOT",
    price: 32_500_000,
    areaValue: 1,
    areaUnit: "KANAL",
    locality: "Bahria Town, Sector C",
    city: "Lahore",
    description: "Possession-ready plot on a 50 ft road, all dues cleared.",
    features: ["Possession", "Corner", "Park facing"],
  });
  const saleFlat = await createListing(ctx, {
    title: "3-bed apartment for sale, Gulberg",
    purpose: "SALE",
    propertyType: "APARTMENT",
    price: 38_000_000,
    areaValue: 1650,
    areaUnit: "SQFT",
    bedrooms: 3,
    bathrooms: 3,
    locality: "Gulberg III",
    city: "Lahore",
    description: "Spacious family apartment with a balcony overlooking the boulevard.",
    features: ["Balcony", "Lift", "Parking"],
    agentUserId: agentUser.id,
  });
  for (const l of [rentFlat, rentShop, saleHouse, salePlot, saleFlat]) {
    await changeListingStatus(ctx, l.id, { status: "ACTIVE" });
  }
  for (const l of [rentFlat, rentShop, saleHouse, salePlot]) {
    await setListingPublished(ctx, l.id, { published: true });
  }

  const leadDefs = [
    { name: "Omer Farooq", phone: "+92 300 1112201", source: "WEBSITE", interest: "RENT", listingId: rentFlat.id, message: "Is the apartment available from next month?" },
    { name: "Sadia Noor", phone: "+92 301 1112202", source: "PORTAL", interest: "SALE", listingId: saleHouse.id, budgetMin: 40_000_000, budgetMax: 48_000_000 },
    { name: "Hamid Raza", phone: "+92 302 1112203", source: "WALK_IN", interest: "RENT", listingId: rentShop.id, message: "Looking for a shop for a café." },
    { name: "Nida Javed", phone: "+92 303 1112204", source: "REFERRAL", interest: "SALE", listingId: salePlot.id },
    { name: "Kashif Mirza", phone: "+92 304 1112205", source: "WHATSAPP", interest: "SALE", listingId: saleFlat.id, budgetMax: 39_000_000 },
    { name: "Rabia Anwar", phone: "+92 305 1112206", source: "PHONE", interest: "RENT", preferredLocation: "Gulberg / Model Town" },
  ] as const;
  const leads = [];
  for (const [i, def] of leadDefs.entries()) {
    const lead = await createLead(ctx, { ...def, assignedUserId: agentUser.id, nextFollowUpAt: addDays(today, i % 3) });
    leads.push(lead);
  }
  await addLeadActivity(ctx, leads[0]!.id, { type: "CALL", body: "Called back — wants to see it this week. Works in Gulberg." });
  await addLeadActivity(ctx, leads[1]!.id, { type: "WHATSAPP", body: "Sent photos and the floor plan." });
  await scheduleViewing(ctx, { leadId: leads[0]!.id, listingId: rentFlat.id, agentUserId: agentUser.id, date: addDays(today, 1), time: "17:30" });
  await scheduleViewing(ctx, { leadId: leads[1]!.id, listingId: saleHouse.id, agentUserId: agentUser.id, date: addDays(today, 2), time: "11:00" });

  // An open deal in negotiation on the DHA house…
  const openDeal = await createDeal(ctx, {
    type: "SALE",
    listingId: saleHouse.id,
    leadId: leads[1]!.id,
    clientName: "Sadia Noor",
    agreedAmount: 44_000_000,
    commissionPercent: 1,
    agentUserId: agentUser.id,
    expectedCloseDate: addDays(today, 21),
  });
  await changeDealStage(ctx, openDeal.id, { stage: "AGREEMENT", note: "Token money agreed, awaiting transfer documents." });
  // …and a closed sale of the unpublished Gulberg apartment.
  const wonDeal = await createDeal(ctx, {
    type: "SALE",
    listingId: saleFlat.id,
    leadId: leads[4]!.id,
    clientName: "Kashif Mirza",
    agreedAmount: 37_200_000,
    commissionPercent: 1,
    agentUserId: agentUser.id,
  });
  await changeDealStage(ctx, wonDeal.id, { stage: "CLOSED_WON", note: "Transfer completed." });

  console.log(`✓ Property demo ready — sign in as ${OWNER_EMAIL} (password ${PASSWORD}); public page /l/${(await prisma.organization.findUniqueOrThrow({ where: { id: org.id }, select: { slug: true } })).slug}`);
}

// Allow running this file directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seedPropertyDemo()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
