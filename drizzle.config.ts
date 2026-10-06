import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// drizzle-kit (generate / studio) uses the session connection when available.
const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL!;

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
});
