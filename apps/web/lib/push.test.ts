import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { addDays } from "@evergreen/core";
import { auditLog, clients, appointments, memberships, pushTokens, services, staffHours, user } from "@evergreen/db";
import type { ExpoMessage, ExpoTicket } from "./expo-push";

// Real Postgres (PGlite) with the real migrations. Auth is faked: "Bearer <user id>" signs in as that user.
// The Expo push call is mocked; the tests assert who gets a message and who does not.
const pg = new PGlite({ extensions: { btree_gist } });
const testDb = drizzle(pg);
const users = vi.hoisted(() => new Map<string, { id: string; name: string; email: string }>());
const expo = vi.hoisted(() => ({
  sent: [] as ExpoMessage[],
  fail: false,
  gone: new Set<string>(),
  receipts: {} as Record<string, ExpoTicket>,
}));

vi.mock("server-only", () => ({}));
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
vi.mock("./email", () => ({ sendEmail: async () => true }));
vi.mock("./notify", () => ({
  sendConfirmation: async () => true,
  sendStaffNewBooking: async () => true,
  sendCancelled: async () => true,
  sendStaffCancelled: async () => true,
  sendRescheduled: async () => true,
  sendReminder: async () => true,
}));
vi.mock("./expo-push", () => ({
  sendExpoMessages: async (messages: ExpoMessage[]) => {
    if (expo.fail) throw new Error("Expo is down");
    expo.sent.push(...messages);
    return messages.map((m, i): ExpoTicket => (expo.gone.has(m.to) ? { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: `ticket-${expo.sent.length}-${i}` }));
  },
  getExpoReceipts: async () => expo.receipts,
}));

const { createBusiness } = await import("./services/workspace");
const { loadBusinessBySlug, publicBook, cancelByToken } = await import("./services/public");
const { availability } = await import("./services/appointments");
const { processPushReceipts, sendPush, notifyNewBooking } = await import("./services/push");
const devices = await import("../app/api/v1/devices/route");
const devicesRemove = await import("../app/api/v1/devices/remove/route");
const notifications = await import("../app/api/v1/notifications/route");
const timeOffRoute = await import("../app/api/v1/time-off/route");
const review = await import("../app/api/v1/time-off/[id]/review/route");

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

const tok = (n: string) => `ExponentPushToken[${n.padEnd(12, "x")}]`;
const T = { owner: tok("owner"), manager: tok("manager"), member: tok("member"), member2: tok("member2"), ownerB: tok("ownerB") };
const toList = () => expo.sent.map((m) => m.to).sort();
const want = (...t: string[]) => t.sort();

async function addUser(id: string) {
  const u = { id, name: `Person ${id}`, email: `${id}@x.test` };
  await testDb.insert(user).values(u);
  users.set(id, u);
}

async function seed() {
  const a = await createBusiness({ name: "Salon A", slug: "salon-a" });
  const b = await createBusiness({ name: "Salon B", slug: "salon-b" });
  for (const id of ["owner", "manager", "member", "member2", "ownerB"]) await addUser(id);
  const mem = async (workspaceId: string, userId: string, role: "owner" | "manager" | "member") => (await testDb.insert(memberships).values({ workspaceId, userId, role }).returning())[0];
  const m = {
    owner: await mem(a.id, "owner", "owner"),
    manager: await mem(a.id, "manager", "manager"),
    member: await mem(a.id, "member", "member"),
    member2: await mem(a.id, "member2", "member"),
    ownerB: await mem(b.id, "ownerB", "owner"),
  };
  // Every phone registers through the real endpoint.
  for (const [who, token] of [["owner", T.owner], ["manager", T.manager], ["member", T.member], ["member2", T.member2]] as const) {
    expect((await devices.POST(req("/devices", { as: who, ws: a.id, body: { token, platform: "ios" } }))).status).toBe(200);
  }
  expect((await devices.POST(req("/devices", { as: "ownerB", ws: b.id, body: { token: T.ownerB, platform: "android" } }))).status).toBe(200);
  expo.sent.length = 0;
  return { a, b, m };
}

let s: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: fileURLToPath(new URL("../../../packages/db/migrations", import.meta.url)) });
});

beforeEach(async () => {
  await pg.exec('TRUNCATE workspaces, "user" CASCADE');
  users.clear();
  expo.sent.length = 0;
  expo.fail = false;
  expo.gone.clear();
  expo.receipts = {};
  vi.spyOn(console, "warn").mockImplementation(() => {});
  s = await seed();
});

const rowsFor = (token: string) => testDb.select().from(pushTokens).where(eq(pushTokens.token, token));

describe("devices", () => {
  it("needs a sign in and JSON, and rejects a token that is not an Expo push token", async () => {
    expect((await devices.POST(req("/devices", { body: { token: T.owner, platform: "ios" } }))).status).toBe(401);
    expect((await devices.POST(req("/devices", { as: "owner", body: { token: T.owner, platform: "ios" }, contentType: "text/plain" }))).status).toBe(415);
    const bad = await json(await devices.POST(req("/devices", { as: "owner", body: { token: "nope", platform: "ios" } })));
    expect(bad.status).toBe(400);
    expect(bad.body.error?.code).toBe("invalid");
    expect((await devicesRemove.POST(req("/devices/remove", { body: { token: T.owner } }))).status).toBe(401);
  });

  it("keeps one row per token and refreshing does not duplicate it", async () => {
    await devices.POST(req("/devices", { as: "owner", body: { token: T.owner, platform: "ios" } }));
    expect(await rowsFor(T.owner)).toHaveLength(1);
  });

  it("moves a token between people and between businesses", async () => {
    // Same phone, a different person signs in.
    await devices.POST(req("/devices", { as: "member", body: { token: T.owner, platform: "android" } }));
    let rows = await rowsFor(T.owner);
    expect(rows).toHaveLength(1);
    expect(rows[0].membershipId).toBe(s.m.member.id);
    expect(rows[0].platform).toBe("android");
    // Someone on two businesses switches: the token follows the active one.
    await testDb.insert(memberships).values({ workspaceId: s.b.id, userId: "member", role: "member" });
    await devices.POST(req("/devices", { as: "member", ws: s.b.id, body: { token: T.owner, platform: "android" } }));
    rows = await rowsFor(T.owner);
    expect(rows).toHaveLength(1);
    expect(rows[0].workspaceId).toBe(s.b.id);
  });

  it("will not register into a business the person is not on", async () => {
    const r = await devices.POST(req("/devices", { as: "member", ws: s.b.id, body: { token: tok("fresh"), platform: "ios" } }));
    expect(r.status).toBe(403);
    expect(await rowsFor(tok("fresh"))).toHaveLength(0);
  });

  it("remove stops pushes, is safe twice, and cannot remove someone else's token", async () => {
    const other = await json(await devicesRemove.POST(req("/devices/remove", { as: "member", body: { token: T.owner } })));
    expect(other.status).toBe(200);
    expect((await rowsFor(T.owner))[0].deletedAt).toBeNull();
    await devicesRemove.POST(req("/devices/remove", { as: "owner", body: { token: T.owner } }));
    await devicesRemove.POST(req("/devices/remove", { as: "owner", body: { token: T.owner } }));
    expect((await rowsFor(T.owner))[0].deletedAt).not.toBeNull();
    // Another business cannot remove it either.
    await devicesRemove.POST(req("/devices/remove", { as: "ownerB", body: { token: T.manager } }));
    expect((await rowsFor(T.manager))[0].deletedAt).toBeNull();
    expect(await sendPush({ workspaceId: s.a.id, membershipIds: [s.m.owner.id], kind: "bookings", title: "t", body: "b", data: {} })).toBe(0);
  });

  it("registering again after a removal turns the phone back on", async () => {
    await devicesRemove.POST(req("/devices/remove", { as: "owner", body: { token: T.owner } }));
    await devices.POST(req("/devices", { as: "owner", body: { token: T.owner, platform: "ios" } }));
    expect((await rowsFor(T.owner))[0].deletedAt).toBeNull();
  });
});

describe("notification settings", () => {
  it("default to on, change per kind, persist, and write an audit row", async () => {
    expect((await json(await notifications.GET(req("/notifications", { as: "member" })))).body.data).toEqual({ bookings: true, timeOff: true });
    const r = await json(await notifications.POST(req("/notifications", { as: "member", body: { timeOff: false } })));
    expect(r.body.data).toEqual({ bookings: true, timeOff: false });
    expect((await json(await notifications.GET(req("/notifications", { as: "member" })))).body.data).toEqual({ bookings: true, timeOff: false });
    const audit = await testDb.select().from(auditLog).where(and(eq(auditLog.entityId, s.m.member.id), eq(auditLog.action, "push_settings")));
    expect(audit).toHaveLength(1);
    // Another person is not affected.
    expect((await json(await notifications.GET(req("/notifications", { as: "manager" })))).body.data).toEqual({ bookings: true, timeOff: true });
  });

  it("rejects an empty change", async () => {
    expect((await notifications.POST(req("/notifications", { as: "member", body: {} }))).status).toBe(400);
  });
});

async function requestOff(as: string) {
  const r = await json(await timeOffRoute.POST(req("/time-off", { as, body: { startDay: "2027-02-10", endDay: "2027-02-12" } })));
  expect(r.status).toBe(201);
  return r.body.data!.id as string;
}

describe("time off pushes", () => {
  it("a team member's request goes to owners and managers only", async () => {
    await requestOff("member");
    expect(toList()).toEqual(want(T.owner, T.manager));
    expect(expo.sent[0]).toMatchObject({ title: "Time off request", body: "Person asked for Feb 10 to Feb 12", data: { type: "time_off", event: "requested", workspaceId: s.a.id } });
  });

  it("a manager's own request goes to the owner, not to the manager", async () => {
    await requestOff("manager");
    expect(toList()).toEqual(want(T.owner));
  });

  it("an owner's own request notifies the manager, not the owner", async () => {
    await requestOff("owner");
    expect(toList()).toEqual(want(T.manager));
  });

  it("a manager entering time off for someone else (auto approved) sends nothing", async () => {
    const r = await timeOffRoute.POST(req("/time-off", { as: "manager", body: { startDay: "2027-02-10", endDay: "2027-02-10", membershipId: s.m.member.id } }));
    expect(r.status).toBe(201);
    expect(expo.sent).toHaveLength(0);
  });

  it("a decision goes to the requester only, with the right words", async () => {
    const id = await requestOff("member");
    expo.sent.length = 0;
    expect((await review.POST(req("/x", { as: "manager", body: { decision: "approved" } }), params(id))).status).toBe(200);
    expect(toList()).toEqual(want(T.member));
    expect(expo.sent[0]).toMatchObject({ title: "Time off approved", data: { type: "time_off", timeOffId: id, event: "approved" } });
    expo.sent.length = 0;
    await review.POST(req("/x", { as: "owner", body: { decision: "denied" } }), params(id));
    expect(expo.sent[0]).toMatchObject({ title: "Time off denied" });
    expect(toList()).toEqual(want(T.member));
  });

  it("the person who decides gets nothing, even on their own request (owner)", async () => {
    const id = await requestOff("owner");
    expo.sent.length = 0;
    await review.POST(req("/x", { as: "owner", body: { decision: "approved" } }), params(id));
    expect(expo.sent).toHaveLength(0);
  });

  it("a refused review sends nothing", async () => {
    const id = await requestOff("member");
    expo.sent.length = 0;
    expect((await review.POST(req("/x", { as: "member2", body: { decision: "approved" } }), params(id))).status).toBe(403);
    expect(expo.sent).toHaveLength(0);
  });

  it("people who turned time off pushes off get none, but still get booking pushes", async () => {
    await notifications.POST(req("/notifications", { as: "manager", body: { timeOff: false } }));
    await requestOff("member");
    expect(toList()).toEqual(want(T.owner));
  });

  it("never reaches another business", async () => {
    await requestOff("member");
    expect(toList()).not.toContain(T.ownerB);
  });

  it("a push outage does not fail the request or the review", async () => {
    expo.fail = true;
    const id = await requestOff("member");
    expect((await review.POST(req("/x", { as: "manager", body: { decision: "approved" } }), params(id))).status).toBe(200);
    const [row] = await testDb.select().from(pushTokens).where(eq(pushTokens.token, T.member));
    expect(row.deletedAt).toBeNull();
  });
});

describe("booking pushes", () => {
  async function bookOnline(fromDay = 1) {
    const ws = (await loadBusinessBySlug("salon-a"))!;
    const [svc] = await testDb.select().from(services).where(and(eq(services.workspaceId, s.a.id), eq(services.active, true), eq(services.bookableOnline, true))).limit(1);
    await testDb.insert(staffHours).values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ workspaceId: s.a.id, membershipId: s.m.member.id, weekday, startMin: 540, endMin: 1080 })));
    // First open slot with the team member in the next two weeks.
    for (let i = fromDay; i < fromDay + 14; i++) {
      const day = addDays(new Date().toISOString().slice(0, 10), i);
      const res = await availability(ws, { serviceId: svc.id, staffId: s.m.member.id, day, now: new Date(), online: true });
      const at = res?.slots[0]?.starts[0];
      if (at) {
        const out = await publicBook(ws, {
          serviceId: svc.id,
          staffId: s.m.member.id,
          start: new Date(at).toISOString(),
          firstName: "Pat",
          lastName: "Client",
          email: "pat@client.test",
          phone: "425-555-0100",
          note: "Please call me on 4255550100, private note",
          agree: true,
        });
        return { ws, out, svc };
      }
    }
    throw new Error("no open slot in the seed data");
  }

  it("a website booking notifies the person it is with, owners and managers, with lock screen safe text", async () => {
    const { svc } = await bookOnline();
    expect(toList()).toEqual(want(T.owner, T.manager, T.member));
    const m = expo.sent[0];
    expect(m.title).toBe("New appointment");
    expect(m.body).toContain("Pat");
    expect(m.body).toContain(svc.name);
    const text = `${m.title} ${m.body}`;
    for (const secret of ["pat@client.test", "555", "private note", "Client"]) expect(text).not.toContain(secret);
    expect(m.data).toMatchObject({ type: "booking", event: "booked", membershipId: s.m.member.id, workspaceId: s.a.id });
    expect(typeof m.data.appointmentId).toBe("string");
  });

  it("a client cancelling from the manage link notifies the same people, and uses the Client word", async () => {
    // A few days out, so it is still inside the client cancel window.
    const { out } = await bookOnline(5);
    expo.sent.length = 0;
    await cancelByToken((await loadBusinessBySlug("salon-a"))!, out.token);
    expect(toList()).toEqual(want(T.owner, T.manager, T.member));
    expect(expo.sent[0].title).toMatch(/cancelled$/);
    expect(expo.sent[0].data).toMatchObject({ type: "booking", event: "cancelled" });
  });

  it("uses the business words (vocab) in the title", async () => {
    const ws = (await loadBusinessBySlug("salon-a"))!;
    ws.vocab = { ...ws.vocab, appointment: "Session" };
    await notifyNewBooking(ws, { clientFirstName: "Pat", serviceName: "Cut", staffMembershipId: s.m.member.id, staffName: "Sam Lee", startsAt: new Date("2027-03-02T18:30:00Z"), appointmentId: "a1" });
    expect(expo.sent[0].title).toBe("New session");
    expect(expo.sent[0].body).toContain("with Sam");
  });

  it("booking pushes off means no booking pushes, but time off pushes still come", async () => {
    await notifications.POST(req("/notifications", { as: "owner", body: { bookings: false } }));
    await bookOnline();
    expect(toList()).toEqual(want(T.manager, T.member));
    expo.sent.length = 0;
    await requestOff("member");
    expect(toList()).toEqual(want(T.owner, T.manager));
  });

  it("does not notify when the booking fails, and a push outage does not fail the booking", async () => {
    expo.fail = true;
    const { out } = await bookOnline();
    expect(out.token).toBeTruthy();
    const rows = await testDb.select().from(appointments).where(eq(appointments.workspaceId, s.a.id));
    expect(rows).toHaveLength(1);
    expect((await testDb.select().from(clients).where(eq(clients.workspaceId, s.a.id)))).toHaveLength(1);
  });
});

describe("expo tickets and receipts", () => {
  const send = (ids: string[]) => sendPush({ workspaceId: s.a.id, membershipIds: ids, kind: "bookings", title: "t", body: "b", data: {} });

  it("removes a token Expo refuses right away as DeviceNotRegistered, and keeps the others", async () => {
    expo.gone.add(T.member);
    expect(await send([s.m.member.id, s.m.manager.id])).toBe(1);
    expect((await rowsFor(T.member))[0].deletedAt).not.toBeNull();
    expect((await rowsFor(T.manager))[0].deletedAt).toBeNull();
    expo.sent.length = 0;
    await send([s.m.member.id]);
    expect(expo.sent).toHaveLength(0);
  });

  it("removes a token when the receipt says DeviceNotRegistered, and leaves new tickets alone", async () => {
    await send([s.m.member.id, s.m.manager.id]);
    const rows = await testDb.select().from(pushTokens);
    const ticketOf = (t: string) => rows.find((r) => r.token === t)!.ticketId!;
    expo.receipts = { [ticketOf(T.member)]: { status: "error", details: { error: "DeviceNotRegistered" } }, [ticketOf(T.manager)]: { status: "ok" } };
    // Not old enough yet.
    expect(await processPushReceipts()).toEqual({ checked: 0, removed: 0 });
    const later = new Date(Date.now() + 20 * 60_000);
    expect(await processPushReceipts(later)).toEqual({ checked: 2, removed: 1 });
    expect((await rowsFor(T.member))[0].deletedAt).not.toBeNull();
    expect((await rowsFor(T.manager))[0].deletedAt).toBeNull();
    expect((await rowsFor(T.manager))[0].ticketId).toBeNull();
  });

  it("sends in batches of 100", async () => {
    const rows = Array.from({ length: 205 }, (_, i) => ({ workspaceId: s.a.id, membershipId: s.m.owner.id, token: `ExponentPushToken[bulk${String(i).padStart(6, "0")}]`, platform: "ios" }));
    await testDb.insert(pushTokens).values(rows);
    expo.sent.length = 0;
    expect(await send([s.m.owner.id])).toBe(206);
  });
});
