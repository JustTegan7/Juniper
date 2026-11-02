import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

// Dev/test hook: point the HTTP driver at a local Neon-compatible endpoint.
if (process.env.NEON_FETCH_ENDPOINT) neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema });
}
