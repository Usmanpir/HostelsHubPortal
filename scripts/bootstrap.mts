/**
 * Production-safe bootstrap: upserts the default subscription plans and
 * feature flags that registration and onboarding depend on. Idempotent and
 * never overwrites plans edited in the admin panel. Creates no demo data —
 * unlike `npm run db:seed`, it is safe to run against production.
 *
 *   npm run db:bootstrap
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { ensurePlans } from "@/lib/db/ensure-plans";

await ensurePlans(prisma);
console.log("Default plans and feature flags are in place.");
await prisma.$disconnect();
