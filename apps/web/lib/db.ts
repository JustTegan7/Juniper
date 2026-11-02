import "server-only";
import { createDb, type Db } from "@evergreen/db";

let _db: Db | undefined;

/** Lazily created so builds without DATABASE_URL still compile. */
export function db(): Db {
  if (!_db) _db = createDb();
  return _db;
}
