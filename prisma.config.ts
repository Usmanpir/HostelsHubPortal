import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    // CLI only (migrations, studio). Prefer the direct connection when the host
    // provides one (Neon's Vercel integration sets DATABASE_URL_UNPOOLED); the
    // app itself always uses the pooled DATABASE_URL.
    url: process.env.DATABASE_URL_UNPOOLED || env("DATABASE_URL"),
  },
});
