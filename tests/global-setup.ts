import "dotenv/config";
import { execSync } from "node:child_process";

/**
 * Bring the test database up to the current migrations once per run.
 * Non-destructive: every test creates its own uniquely-named tenants, so no
 * data needs to be wiped between runs.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL must be set to run integration tests");
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error(`TEST_DATABASE_URL must point at a dedicated test database (name containing "test"), got ${new URL(url).pathname}`);
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
