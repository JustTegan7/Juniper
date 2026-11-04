import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { appointmentSegments, appointments, clients, memberships, timeOff, user } from "@evergreen/db";

// Real Postgres (PGlite) with the real migrations. Auth is faked: "Bearer <user id>" signs in as that user.
const pg = new PGlite({ extensions: { btree_gist } });
const testDb = drizzle(pg);
const users = vi.hoisted(() => new Map<string, { id: string; name: string; email: string }>());

vi.mock("server-only", () => ({}));
// Neon's batch (one transaction) for both batch([...]) and db().batch([...]), which some services call directly.
async function runBatch(items: PromiseLike<unknown>[]) {
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
}
Object.assign(testDb, { batch: runBatch });
vi.mock("./db", () => ({ db: () => testDb, batch: runBatch }));
vi.mock("./auth", () => ({
  auth: () => ({
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const h = headers.get("authorization") ?? "";
        const u = h.startsWith("Bearer ") ? users.get(h.slice(7)) : undefined;
        return u ? { user: u, session: { userId: u.id } } : null;
      },
    },
  }),
}));

const { createBusiness } = await import("./services/workspace");
const me = await import("../app/api/v1/me/route");
const switchWs = await import("../app/api/v1/me/workspace/route");
const today = await import("../app/api/v1/appointments/today/route");
const status = await import("../app/api/v1/appointments/[id]/status/route");
const clock = await import("../app/api/v1/clock/route");
const clockIn = await import("../app/api/v1/clock/in/route");
const clockOut = await import("../app/api/v1/clock/out/route");
const breakStart = await import("../app/api/v1/clock/breaks/start/route");
const breakEnd = await import("../app/api/v1/clock/breaks/end/route");
const timeOffRoute = await import("../app/api/v1/time-off/route");
const review = await import("../app/api/v1/time-off/[id]/review/route");
const cancel = await import("../app/api/v1/time-off/[id]/cancel/route");

const BASE = "http://test.local/api/v1";

function req(path: string, opts: { as?: string; ws?: string; body?: unknown; method?: string; contentType?: string } = {}) {
  const headers = new Headers();
  if (opts.as) headers.set("authorization", `Bearer ${opts.as}`);
  if (opts.ws) headers.set("x-juniper-workspace", opts.ws);
  if (opts.body !== undefined) headers.set("content-type", opts.contentType ?? "application/json");
  return new NextRequest(`${BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
async function json(res: Response) {
  return { status: res.status, body: (await res.json()) as { data?: Record<string, unknown>; error?: { code: string; message: string } } };
}

async function addUser(id: string) {
  const u = { id, name: `Person ${id}`, email: `${id}@x.test` };
  await testDb.insert(user).values(u);
  users.set(id, u);
  return u;
}

/** Two businesses. A has an owner, manager and two members; B has its own owner. "both" is a member of A and B. */
async function seed() {
  const a = await createBusiness({ name: "Salon A", slug: "salon-a" });
  const b = await createBusiness({ name: "Salon B", slug: "salon-b" });
  for (const id of ["ownerA", "managerA", "memberA", "member2A", "ownerB", "both", "loner"]) await addUser(id);
  const mem = async (workspaceId: string, userId: string, role: "owner" | "manager" | "member") =>
    (await testDb.insert(memberships).values({ workspaceId, userId, role }).returning())[0];
  const m = {
    ownerA: await mem(a.id, "ownerA", "owner"),
    managerA: await mem(a.id, "managerA", "manager"),
    memberA: await mem(a.id, "memberA", "member"),
    member2A: await mem(a.id, "member2A", "member"),
    ownerB: await mem(b.id, "ownerB", "owner"),
    bothA: await mem(a.id, "both", "member"),
    bothB: await mem(b.id, "both", "manager"),
  };
  const [clientA] = await testDb.insert(clients).values({ workspaceId: a.id, firstName: "Pat" }).returning();
  const [clientB] = await testDb.insert(clients).values({ workspaceId: b.id, firstName: "Sam" }).returning();
  // Straddles "now", so it is always on today's calendar whatever the time zone.
  const start = new Date(Date.now() - 30 * 60_000);
  const end = new Date(Date.now() + 30 * 60_000);
  async function book(workspaceId: string, clientId: string, membershipId: string) {
    const [row] = await testDb
      .insert(appointments)
      .values({ workspaceId, clientId, membershipId, serviceName: "Cut", startsAt: start, endsAt: end, activeBefore: 60, status: "booked" })
      .returning();
    await testDb.insert(appointmentSegments).values({ workspaceId, appointmentId: row.id, membershipId, startsAt: start, endsAt: end });
    return row;
  }
  const appt = {
    memberA: await book(a.id, clientA.id, m.memberA.id),
    member2A: await book(a.id, clientA.id, m.member2A.id),
    ownerB: await book(b.id, clientB.id, m.ownerB.id),
  };
  return { a, b, m, appt };
}

async function addTimeOff(workspaceId: string, membershipId: string) {
  const [row] = await testDb
    .insert(timeOff)
    .values({ workspaceId, membershipId, startsAt: new Date("2027-01-10T08:00:00Z"), endsAt: new Date("2027-01-11T08:00:00Z"), allDay: true, startDay: "2027-01-10", endDay: "2027-01-10", status: "pending" })
    .returning();
  return row;
}

const statusOf = async (id: string) => (await testDb.select().from(appointments).where(eq(appointments.id, id)))[0].status;
const timeOffStatus = async (id: string) => (await testDb.select().from(timeOff).where(eq(timeOff.id, id)))[0].status;

let s: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: fileURLToPath(new URL("../../../packages/db/migrations", import.meta.url)) });
});

beforeEach(async () => {
  await pg.exec('TRUNCATE workspaces, "user" CASCADE');
  users.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  s = await seed();
});

describe("auth failures", () => {
  it("answers 401 with no token or an unknown token", async () => {
    for (const as of [undefined, "nobody"]) {
      const r = await json(await me.GET(req("/me", { as })));
      expect(r.status).toBe(401);
      expect(r.body.error?.code).toBe("unauthorized");
    }
    expect((await clockIn.POST(req("/clock/in", { method: "POST" }))).status).toBe(401);
    expect((await today.GET(req("/appointments/today"))).status).toBe(401);
  });

  it("does not run the write when the token is missing", async () => {
    const r = await status.POST(req("/x", { body: { status: "completed" } }), params(s.appt.memberA.id));
    expect(r.status).toBe(401);
    expect(await statusOf(s.appt.memberA.id)).toBe("booked");
  });

  it("answers 403 no_workspace for a login that is on no team", async () => {
    const r = await json(await me.GET(req("/me", { as: "loner" })));
    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe("no_workspace");
  });

  it("refuses a write body that is not JSON", async () => {
    const r = await review.POST(req("/x", { as: "ownerA", body: { decision: "approved" }, contentType: "text/plain" }), params(s.appt.memberA.id));
    expect(r.status).toBe(415);
  });
});

describe("workspace scoping", () => {
  it("returns me for the first business by default and lists every business", async () => {
    const r = await json(await me.GET(req("/me", { as: "both" })));
    expect(r.status).toBe(200);
    expect((r.body.data?.workspace as { id: string }).id).toBe(s.a.id);
    expect((r.body.data?.workspaces as unknown[]).length).toBe(2);
    expect(r.body.data?.role).toBe("member");
  });

  it("switches to another business the person is on, with that business's role", async () => {
    const r = await json(await switchWs.POST(req("/me/workspace", { as: "both", body: { workspaceId: s.b.id } })));
    expect(r.status).toBe(200);
    expect((r.body.data?.workspace as { id: string }).id).toBe(s.b.id);
    expect(r.body.data?.role).toBe("manager");
    const again = await json(await me.GET(req("/me", { as: "both", ws: s.b.id })));
    expect((again.body.data?.workspace as { id: string }).id).toBe(s.b.id);
  });

  it("refuses to switch to, or send a header for, a business the person is not on", async () => {
    const sw = await json(await switchWs.POST(req("/me/workspace", { as: "ownerA", body: { workspaceId: s.b.id } })));
    expect(sw.status).toBe(403);
    expect(sw.body.error?.code).toBe("forbidden");
    const hdr = await json(await today.GET(req("/appointments/today?scope=all", { as: "ownerA", ws: s.b.id })));
    expect(hdr.status).toBe(403);
  });

  it("only returns the active business's appointments", async () => {
    const r = await json(await today.GET(req("/appointments/today?scope=all", { as: "ownerA" })));
    expect(r.status).toBe(200);
    const ids = (r.body.data?.appointments as { id: string }[]).map((x) => x.id).sort();
    expect(ids).toEqual([s.appt.memberA.id, s.appt.member2A.id].sort());
    const mine = await json(await today.GET(req("/appointments/today", { as: "memberA" })));
    expect((mine.body.data?.appointments as { id: string }[]).map((x) => x.id)).toEqual([s.appt.memberA.id]);
  });

  it("answers 404 for another business's appointment and leaves it alone", async () => {
    const r = await json(await status.POST(req("/x", { as: "ownerA", body: { status: "completed" } }), params(s.appt.ownerB.id)));
    expect(r.status).toBe(404);
    expect(await statusOf(s.appt.ownerB.id)).toBe("booked");
  });

  it("answers 404 for another business's time off on review and cancel", async () => {
    const t = await addTimeOff(s.b.id, s.m.ownerB.id);
    expect((await review.POST(req("/x", { as: "ownerA", body: { decision: "approved" } }), params(t.id))).status).toBe(404);
    expect((await cancel.POST(req("/x", { as: "ownerA", method: "POST" }), params(t.id))).status).toBe(404);
    expect(await timeOffStatus(t.id)).toBe("pending");
  });

  it("clocks in to the business in the header only", async () => {
    expect((await clockIn.POST(req("/clock/in", { as: "both", ws: s.b.id, method: "POST" }))).status).toBe(200);
    const inA = await json(await clock.GET(req("/clock", { as: "both", ws: s.a.id })));
    expect(inA.body.data?.clockedIn).toBe(false);
    const inB = await json(await clock.GET(req("/clock", { as: "both", ws: s.b.id })));
    expect(inB.body.data?.clockedIn).toBe(true);
  });
});

describe("roles", () => {
  it("member: changes own appointment, not a teammate's", async () => {
    const own = await status.POST(req("/x", { as: "memberA", body: { status: "checked_in" } }), params(s.appt.memberA.id));
    expect(own.status).toBe(200);
    expect(await statusOf(s.appt.memberA.id)).toBe("checked_in");
    const other = await json(await status.POST(req("/x", { as: "memberA", body: { status: "completed" } }), params(s.appt.member2A.id)));
    expect(other.status).toBe(403);
    expect(await statusOf(s.appt.member2A.id)).toBe("booked");
  });

  it("manager and owner: change anyone's appointment", async () => {
    expect((await status.POST(req("/x", { as: "managerA", body: { status: "completed" } }), params(s.appt.member2A.id))).status).toBe(200);
    expect((await status.POST(req("/x", { as: "ownerA", body: { status: "confirmed" } }), params(s.appt.memberA.id))).status).toBe(200);
  });

  it("rejects an unknown status with 400", async () => {
    const r = await json(await status.POST(req("/x", { as: "ownerA", body: { status: "teleported" } }), params(s.appt.memberA.id)));
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe("invalid");
  });

  it("member: requests own time off, cannot request for someone else or review", async () => {
    const mine = await json(await timeOffRoute.POST(req("/time-off", { as: "memberA", body: { startDay: "2027-02-01", endDay: "2027-02-02" } })));
    expect(mine.status).toBe(201);
    const id = mine.body.data?.id as string;
    expect(await timeOffStatus(id)).toBe("pending");
    const forOther = await timeOffRoute.POST(req("/time-off", { as: "memberA", body: { startDay: "2027-02-01", endDay: "2027-02-01", membershipId: s.m.member2A.id } }));
    expect(forOther.status).toBe(403);
    const t = await addTimeOff(s.a.id, s.m.member2A.id);
    expect((await review.POST(req("/x", { as: "memberA", body: { decision: "approved" } }), params(t.id))).status).toBe(403);
    expect(await timeOffStatus(t.id)).toBe("pending");
  });

  it("manager: approves others, cannot approve their own; owner can approve their own", async () => {
    const t = await addTimeOff(s.a.id, s.m.memberA.id);
    expect((await review.POST(req("/x", { as: "managerA", body: { decision: "approved" } }), params(t.id))).status).toBe(200);
    expect(await timeOffStatus(t.id)).toBe("approved");
    const own = await addTimeOff(s.a.id, s.m.managerA.id);
    expect((await review.POST(req("/x", { as: "managerA", body: { decision: "approved" } }), params(own.id))).status).toBe(403);
    const ownerOwn = await addTimeOff(s.a.id, s.m.ownerA.id);
    expect((await review.POST(req("/x", { as: "ownerA", body: { decision: "denied" } }), params(ownerOwn.id))).status).toBe(200);
    expect(await timeOffStatus(ownerOwn.id)).toBe("denied");
  });

  it("member: cancels own time off, not a teammate's; manager cancels anyone's", async () => {
    const own = await addTimeOff(s.a.id, s.m.memberA.id);
    const other = await addTimeOff(s.a.id, s.m.member2A.id);
    expect((await cancel.POST(req("/x", { as: "memberA", method: "POST" }), params(own.id))).status).toBe(200);
    expect((await cancel.POST(req("/x", { as: "memberA", method: "POST" }), params(other.id))).status).toBe(403);
    expect(await timeOffStatus(other.id)).toBe("pending");
    expect((await cancel.POST(req("/x", { as: "managerA", method: "POST" }), params(other.id))).status).toBe(200);
  });

  it("time off list: members see their own, managers see everyone's", async () => {
    await addTimeOff(s.a.id, s.m.memberA.id);
    await addTimeOff(s.a.id, s.m.member2A.id);
    await addTimeOff(s.b.id, s.m.ownerB.id);
    const mine = await json(await timeOffRoute.GET(req("/time-off", { as: "memberA" })));
    expect((mine.body.data?.requests as { membershipId: string }[]).map((r) => r.membershipId)).toEqual([s.m.memberA.id]);
    const all = await json(await timeOffRoute.GET(req("/time-off", { as: "managerA" })));
    expect((all.body.data?.requests as unknown[]).length).toBe(2);
  });

  it("member: clock in, break, back, clock out", async () => {
    const as = "memberA";
    const inn = await json(await clockIn.POST(req("/clock/in", { as, method: "POST" })));
    expect(inn.status).toBe(200);
    expect((inn.body.data?.clock as { clockedIn: boolean }).clockedIn).toBe(true);
    const twice = await json(await clockIn.POST(req("/clock/in", { as, method: "POST" })));
    expect(twice.status).toBe(400);
    expect(twice.body.error?.message).toBe("You are already clocked in.");
    const brk = await json(await breakStart.POST(req("/x", { as, body: { kind: "meal" } })));
    expect((brk.body.data?.clock as { openBreak: { kind: string } }).openBreak.kind).toBe("meal");
    expect((await breakStart.POST(req("/x", { as, body: { kind: "nap" } }))).status).toBe(400);
    expect((await breakEnd.POST(req("/x", { as, method: "POST" }))).status).toBe(200);
    const out = await json(await clockOut.POST(req("/x", { as, method: "POST" })));
    expect(out.status).toBe(200);
    expect((out.body.data?.clock as { clockedIn: boolean }).clockedIn).toBe(false);
  });
});
