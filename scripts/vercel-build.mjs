/**
 * Vercel build entry (Vercel runs the `vercel-build` script instead of `build`
 * when it exists). Production deploys apply pending migrations and the plan
 * bootstrap before building. Preview deploys only migrate when they have their
 * own database (e.g. a Neon preview branch) — set MIGRATE_ON_PREVIEW=true —
 * so an unmerged branch can't change the production schema.
 */
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const env = process.env.VERCEL_ENV;
const migrate = env === "production" || (env === "preview" && process.env.MIGRATE_ON_PREVIEW === "true");

run("npx prisma generate");
if (migrate) {
  run("npx prisma migrate deploy");
  run("npx tsx --conditions=react-server scripts/bootstrap.mts");
} else {
  console.log(`Skipping migrations for VERCEL_ENV=${env ?? "unset"}.`);
}
run("npx next build");
