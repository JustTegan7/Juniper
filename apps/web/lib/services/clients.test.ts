import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import { appointmentSegments, appointments, auditLog, clients, memberships, user } from "@evergreen/db";

// Real Postgres (PGlite) with the real migrations, so the RESTRICT key and cascades behave as in production.
const pg = new PGlite({ extensions: { btree_gist } });
const testDb = drizzle(pg);

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  db: () => testDb,
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

const { deleteClient, getClientDeleteSummary } = await import("./clients");
const { createBusiness } = await import("./workspace");
const { ForbiddenError } = await import("./ctx");
type Ctx = import("./ctx").Ctx;

const NOW = new Date("2026-11-04T12:00:00Z");
const PAST = new Date("2026-10-01T17:00:00Z");
const FUTURE = new Date("2026-12-01T17:00:00Z");
const hour = (d: Date) => new Date(d.getTime() + 3_600_000);

async function seed(slug: string) {
  const ws = await createBusiness({ name: `Business ${slug}`, slug });
  const uid = `u-${slug}`;
  await testDb.insert(user).values({ id: uid, name: `Owner ${slug}`, email: `${slug}@x.test` });
  const [m] = await testDb.insert(memberships).values({ workspaceId: ws.id, userId: uid, role: "owner" }).returning();
  const [pat] = await testDb.insert(clients).values({ workspaceId: ws.id, firstName: "Pat", email: `pat@${slug}.test`, userId: uid }).returning();
  const [sam] = await testDb.insert(clients).values({ workspaceId: ws.id, firstName: "Sam" }).returning();
  let day = 0;
  async function book(clientId: string, startsAt: Date, status: typeof appointments.$inferInsert.status = "booked") {
    // Different days so one staff column never overlaps.
    const start = new Date(startsAt.getTime() + day++ * 86_400_000);
    const [a] = await testDb
      .insert(appointments)
      .values({ workspaceId: ws.id, clientId, membershipId: m.id, serviceName: "Cut", startsAt: start, endsAt: hour(start), activeBefore: 60, status })
      .returning();
    await testDb.insert(appointmentSegments).values({ workspaceId: ws.id, appointmentId: a.id, membershipId: m.id, startsAt: start, endsAt: hour(start) });
    return a;
  }
  return { ws, m, uid, pat, sam, book };
}

function ctxFor(s: Awaited<ReturnType<typeof seed>>, role: Ctx["role"]): Ctx {
  return { userId: s.uid, name: "Tester", email: "t@x.test", role, membershipId: s.m.id, workspace: { id: s.ws.id } } as unknown as Ctx;
}

const count = async (workspaceId: string, clientId?: string) =>
  (await testDb.select().from(appointments).where(clientId ? and(eq(appointments.workspaceId, workspaceId), eq(appointments.clientId, clientId)) : eq(appointments.workspaceId, workspaceId))).length;

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url)) });
});

beforeEach(async () => {
  await pg.exec('TRUNCATE workspaces, "user" CASCADE');
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("deleteClient", () => {
  it("refuses a stylist (member) and deletes nothing", async () => {
    const a = await seed("salon-a");
    await a.book(a.pat.id, PAST);
    const ctx = ctxFor(a, "member");
    await expect(deleteClient(ctx, { id: a.pat.id, acknowledgeUpcoming: true }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getClientDeleteSummary(ctx, { id: a.pat.id }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await count(a.ws.id)).toBe(1);
    expect(await testDb.select().from(clients).where(eq(clients.id, a.pat.id))).toHaveLength(1);
  });

  it("lets owners and managers delete", async () => {
    for (const role of ["owner", "manager"] as const) {
      const a = await seed(`salon-${role}`);
      await a.book(a.pat.id, PAST);
      await deleteClient(ctxFor(a, role), { id: a.pat.id }, NOW);
      expect(await testDb.select().from(clients).where(eq(clients.id, a.pat.id))).toHaveLength(0);
    }
  });

  it("deleting a client in business A leaves business B untouched", async () => {
    const a = await seed("salon-a");
    const b = await seed("salon-b");
    await a.book(a.pat.id, PAST);
    await b.book(b.pat.id, PAST);
    await b.book(b.pat.id, FUTURE);

    await deleteClient(ctxFor(a, "owner"), { id: a.pat.id }, NOW);
    expect(await count(a.ws.id)).toBe(0);
    expect(await count(b.ws.id)).toBe(2);
    expect((await testDb.select().from(clients).where(eq(clients.workspaceId, b.ws.id))).length).toBe(2);
    expect((await testDb.select().from(appointmentSegments).where(eq(appointmentSegments.workspaceId, b.ws.id))).length).toBe(2);

    // A guessed id from another business is not found and changes nothing.
    await expect(deleteClient(ctxFor(a, "owner"), { id: b.pat.id, acknowledgeUpcoming: true }, NOW)).rejects.toThrow("not found");
    expect(await count(b.ws.id)).toBe(2);
    expect((await testDb.select().from(clients).where(eq(clients.id, b.pat.id))).length).toBe(1);
  });

  it("removes the client's appointments and segments, and keeps other clients' appointments", async () => {
    const a = await seed("salon-a");
    await a.book(a.pat.id, PAST);
    await a.book(a.pat.id, PAST, "cancelled");
    await a.book(a.sam.id, PAST);
    await a.book(a.sam.id, FUTURE);

    await deleteClient(ctxFor(a, "owner"), { id: a.pat.id }, NOW);
    expect(await count(a.ws.id, a.pat.id)).toBe(0);
    expect(await count(a.ws.id, a.sam.id)).toBe(2);
    expect(await testDb.select().from(appointmentSegments).where(eq(appointmentSegments.workspaceId, a.ws.id))).toHaveLength(2);
    expect(await testDb.select().from(clients).where(eq(clients.id, a.sam.id))).toHaveLength(1);
    // The linked login is shared and stays; the audit row records the delete.
    expect(await testDb.select().from(user).where(eq(user.id, a.uid))).toHaveLength(1);
    const audit = await testDb.select().from(auditLog).where(and(eq(auditLog.entity, "client"), eq(auditLog.entityId, a.pat.id)));
    expect(audit.map((r) => r.action)).toEqual(["deleted"]);
  });

  it("counts past, upcoming and cancelled for the confirmation", async () => {
    const a = await seed("salon-a");
    await a.book(a.pat.id, PAST);
    await a.book(a.pat.id, PAST, "completed");
    await a.book(a.pat.id, FUTURE);
    await a.book(a.pat.id, FUTURE, "cancelled");
    expect(await getClientDeleteSummary(ctxFor(a, "manager"), { id: a.pat.id }, NOW)).toEqual({ past: 2, upcoming: 1, cancelled: 1, total: 4 });
  });

  it("needs the acknowledgement only for upcoming non-cancelled appointments", async () => {
    const a = await seed("salon-a");
    await a.book(a.pat.id, FUTURE);
    await a.book(a.sam.id, FUTURE, "cancelled");
    const ctx = ctxFor(a, "owner");

    await expect(deleteClient(ctx, { id: a.pat.id, acknowledgeUpcoming: false }, NOW)).rejects.toThrow("Tick the box");
    expect(await count(a.ws.id, a.pat.id)).toBe(1);
    await deleteClient(ctx, { id: a.pat.id, acknowledgeUpcoming: true }, NOW);
    expect(await count(a.ws.id, a.pat.id)).toBe(0);

    // Only a cancelled future appointment: no checkbox needed.
    await deleteClient(ctx, { id: a.sam.id }, NOW);
    expect(await count(a.ws.id)).toBe(0);
  });

  it("writes a structured log line", async () => {
    const a = await seed("salon-a");
    await a.book(a.pat.id, PAST);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await deleteClient(ctxFor(a, "owner"), { id: a.pat.id }, NOW);
    const line = JSON.parse(warn.mock.calls.at(-1)![0] as string);
    expect(line).toMatchObject({ event: "client_deleted", by: a.uid, workspaceId: a.ws.id, clientId: a.pat.id, counts: { past: 1, upcoming: 0, cancelled: 0, total: 1 } });
  });
});
