import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prisma CLI uses Neon's direct connection; the app uses pooled DATABASE_URL.
    url: process.env.DIRECT_URL ?? "postgresql://invalid:invalid@localhost:5432/cinebite",
  },
});
