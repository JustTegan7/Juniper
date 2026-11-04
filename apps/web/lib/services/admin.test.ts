import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { appointmentSegments, appointments, auditLog, clients, memberships, services, timeEntries, user, workspaces } from "@evergreen/db";

// Real Postgres (PGlite) with the real migrations, so cascades, RESTRICT keys and the
// unique link name behave exactly as in production.
const pg = new PGlite({ extensions: { btree_gist } });
const testDb = drizzle(pg);

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  db: () => testDb,
  // Same contract as the real batch: all statements run in one transaction.
  batch: async (items: PromiseLike<unknown>[]) => {
    await pg.exec("BEGIN");
    try {
      const out: unknown[] = [];
      for (const q of items) out.push(await q);
      await pg.exec("COMMIT");
      return out;
    } catch (e) {
      await pg.exec("ROLLBACK");
      throw e;
    }
  },
}));

const { deleteBusiness, loadBusinessCounts, NotPlatformAdminError } = await import("./admin");
const { createBusiness } = await import("./workspace");

const admin = { userId: "u-admin", email: "admin@evergreen.test" };
const stranger = { userId: "u-x", email: "owner@salon.test" };

async function seed(slug: string, opts: { withHistory: boolean }) {
  const ws = await createBusiness({ name: `Business ${slug}`, slug, starterServices: true });
  const uid = `u-${slug}`;
  await testDb.insert(user).values({ id: uid, name: `Stylist ${slug}`, email: `${slug}@x.test` });
  const [m] = await testDb.insert(memberships).values({ workspaceId: ws.id, userId: uid, role: "owner" }).returning();
  if (opts.withHistory) {
    const [c] = await testDb.insert(clients).values({ workspaceId: ws.id, firstName: "Pat", email: `pat@${slug}.test` }).returning();
    const start = new Date("2026-12-01T17:00:00Z");
    const end = new Date("2026-12-01T18:00:00Z");
    const [a] = await testDb
      .insert(appointments)
      .values({ workspaceId: ws.id, clientId: c.id, membershipId: m.id, serviceName: "Cut", startsAt: start, endsAt: end, activeBefore: 60 })
      .returning();
    await testDb.insert(appointmentSegments).values({ workspaceId: ws.id, appointmentId: a.id, membershipId: m.id, startsAt: start, endsAt: end });
    await testDb.insert(timeEntries).values({ workspaceId: ws.id, membershipId: m.id, clockIn: start, clockOut: end });
    await testDb.insert(auditLog).values({ workspaceId: ws.id, entity: "appointment", entityId: a.id, action: "create" });
  }
  return ws;
}

async function rowCounts(workspaceId: string) {
  const n = async (t: typeof appointments | typeof clients | typeof memberships | typeof timeEntries | typeof services | typeof appointmentSegments | typeof auditLog) =>
    (await testDb.select().from(t).where(eq(t.workspaceId, workspaceId))).length;
  return {
    appointments: await n(appointments),
    segments: await n(appointmentSegments),
    clients: await n(clients),
    staff: await n(memberships),
    timeEntries: await n(timeEntries),
    services: await n(services),
    audit: await n(auditLog),
  };
}

beforeAll(async () => {
  process.env.PLATFORM_ADMINS = "admin@evergreen.test";
  await migrate(testDb, { migrationsFolder: fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url)) });
});

beforeEach(async () => {
  await pg.exec("TRUNCATE workspaces, \"user\" CASCADE");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("deleteBusiness", () => {
  it("refuses anyone who is not a platform admin and deletes nothing", async () => {
    const a = await seed("salon-a", { withHistory: true });
    const before = await rowCounts(a.id);
    await expect(deleteBusiness(stranger, { workspaceId: a.id, confirmSlug: "salon-a", acknowledgeData: true })).rejects.toBeInstanceOf(NotPlatformAdminError);
    await expect(loadBusinessCounts(stranger)).rejects.toBeInstanceOf(NotPlatformAdminError);
    expect(await rowCounts(a.id)).toEqual(before);
    expect(await testDb.select().from(workspaces).where(eq(workspaces.id, a.id))).toHaveLength(1);
  });

  it("deleting business A leaves business B untouched", async () => {
    const a = await seed("salon-a", { withHistory: true });
    const b = await seed("salon-b", { withHistory: true });
    const bBefore = await rowCounts(b.id);
    expect(bBefore.appointments).toBe(1);
    expect(bBefore.services).toBeGreaterThan(0);

    const res = await deleteBusiness(admin, { workspaceId: a.id, confirmSlug: "salon-a", acknowledgeData: true });
    expect(res.counts).toMatchObject({ appointments: 1, clients: 1, staff: 1, timeEntries: 1 });

    expect(await rowCounts(a.id)).toEqual({ appointments: 0, segments: 0, clients: 0, staff: 0, timeEntries: 0, services: 0, audit: 0 });
    expect(await testDb.select().from(workspaces).where(eq(workspaces.id, a.id))).toHaveLength(0);
    expect(await rowCounts(b.id)).toEqual(bBefore);
    expect(await testDb.select().from(workspaces).where(eq(workspaces.id, b.id))).toHaveLength(1);
    // Login accounts are shared across businesses, so they stay.
    expect(await testDb.select().from(user)).toHaveLength(2);
  });

  it("makes the link name available again", async () => {
    const a = await seed("salon-a", { withHistory: false });
    await expect(createBusiness({ name: "Again", slug: "salon-a" })).rejects.toThrow("taken");
    await deleteBusiness(admin, { workspaceId: a.id, confirmSlug: "salon-a", acknowledgeData: false });
    const again = await createBusiness({ name: "Again", slug: "salon-a" });
    expect(again.slug).toBe("salon-a");
    expect(again.id).not.toBe(a.id);
  });

  it("requires the exact link name", async () => {
    const a = await seed("salon-a", { withHistory: false });
    await expect(deleteBusiness(admin, { workspaceId: a.id, confirmSlug: "salon-aa", acknowledgeData: true })).rejects.toThrow("does not match");
    await expect(deleteBusiness(admin, { workspaceId: a.id, confirmSlug: "", acknowledgeData: true })).rejects.toThrow("does not match");
    expect(await testDb.select().from(workspaces).where(eq(workspaces.id, a.id))).toHaveLength(1);
  });

  it("needs the acknowledgement when there are appointments or time entries", async () => {
    const a = await seed("salon-a", { withHistory: true });
    await expect(deleteBusiness(admin, { workspaceId: a.id, confirmSlug: "salon-a", acknowledgeData: false })).rejects.toThrow("Tick the box");
    expect((await rowCounts(a.id)).appointments).toBe(1);
    await deleteBusiness(admin, { workspaceId: a.id, confirmSlug: "salon-a", acknowledgeData: true });
    expect((await rowCounts(a.id)).appointments).toBe(0);
  });

  it("reports counts for the confirmation", async () => {
    const a = await seed("salon-a", { withHistory: true });
    const counts = await loadBusinessCounts(admin);
    expect(counts[a.id]).toMatchObject({ appointments: 1, clients: 1, staff: 1, timeEntries: 1 });
    expect(counts[a.id].services).toBeGreaterThan(0);
  });
});
