/**
 * Development helper: removes the "Demo Property Group" demo organization so
 * `npm run db:seed` can recreate it. Refuses to run in production or on an
 * organization that wasn't created by the demo seed (owner email check).
 *
 *   npx tsx --conditions=react-server scripts/reset-property-demo.mts
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to run in production.");
const DEMO_EMAILS = ["property@demo-rentals.dev", "agent@demo-rentals.dev"];

const owner = await prisma.user.findUnique({ where: { email: DEMO_EMAILS[0] }, select: { id: true } });
const orgs = owner
  ? await prisma.organization.findMany({ where: { name: "Demo Property Group", members: { some: { userId: owner.id, isOwner: true } } }, select: { id: true } })
  : await prisma.organization.findMany({ where: { name: "Demo Property Group", members: { none: {} } }, select: { id: true } });
for (const org of orgs) await prisma.organization.delete({ where: { id: org.id } });
await prisma.user.deleteMany({ where: { email: { in: DEMO_EMAILS } } });
console.log(`Removed ${orgs.length} demo property organization(s).`);
await prisma.$disconnect();
