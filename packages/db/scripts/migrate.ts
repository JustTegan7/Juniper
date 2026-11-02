// Applies migrations in packages/db/migrations. Runs on every Vercel build
// (see apps/web package.json "vercel-build") and locally with npm run db:migrate.
import { config } from "dotenv";
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { fileURLToPath } from "node:url";

config({ path: fileURLToPath(new URL("../../../apps/web/.env.local", import.meta.url)) });

if (process.env.NEON_FETCH_ENDPOINT) neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;
const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL not set, skipping migrations.");
  process.exit(0);
}

await migrate(drizzle(neon(url)), { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
console.log("Migrations applied.");
