import "server-only";
import { createDb, type Db } from "@evergreen/db";

let _db: Db | undefined;

/** Lazily created so builds without DATABASE_URL still compile. */
export function db(): Db {
  if (!_db) _db = createDb();
  return _db;
}

type BatchItem = Parameters<Db["batch"]>[0][number];

/** Runs queries in one transaction. Accepts a plain list, so optional steps can be spread in. */
export async function batch(items: BatchItem[]) {
  if (!items.length) return [];
  return db().batch(items as [BatchItem, ...BatchItem[]]);
}
