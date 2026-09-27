import "dotenv/config";

// Point every Prisma client created in tests at the isolated test database.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL must be set to run integration tests");
process.env.DATABASE_URL = testUrl;
// Keep test output quiet and deterministic.
process.env.EMAIL_SERVER = "";
process.env.STORAGE_DRIVER = "local";
