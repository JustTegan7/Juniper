import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: "../../apps/web/.env.local" });

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
