import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { auditLog, memberships, user } from "@evergreen/db";
import { parseSettings } from "@evergreen/core";

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

const { createBusiness } = await import("./workspace");
const { ForbiddenError } = await import("./ctx");
const { listPayProfiles, payProfileMap, savePayProfile } = await import("./pay");
type Ctx = import("./ctx").Ctx;

async function person(wsId: string, slug: string, name: string, role: Ctx["role"], time: object) {
  const uid = `u-${slug}-${name}`;
  await testDb.insert(user).values({ id: uid, name, email: `${uid}@x.test` });
  const [m] = await testDb.insert(memberships).values({ workspaceId: wsId, userId: uid, role }).returning();
  return { userId: uid, name, email: `${uid}@x.test`, role, membershipId: m!.id, workspace: { id: wsId, settings: parseSettings({ time }) } } as unknown as Ctx;
}

async function seed(slug: string, time: object = {}) {
  const ws = await createBusiness({ name: `Shop ${slug}`, slug });
  const owner = await person(ws.id, slug, "Olive Owner", "owner", time);
  const ana = await person(ws.id, slug, "Ana Member", "member", time);
  const mgr = await person(ws.id, slug, "Max Manager", "manager", time);
  return { ws, owner, ana, mgr };
}

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url)) });
});
beforeEach(async () => {
  await pg.exec('TRUNCATE workspaces, "user" CASCADE');
});

describe("pay profiles", () => {
  it("saves hourly and salary rates in cents and lists them for the owner", async () => {
    const { owner, ana, mgr } = await seed("p-a");
    await savePayProfile(owner, { membershipId: ana.membershipId, payType: "hourly", rate: "$18.50" });
    await savePayProfile(owner, { membershipId: mgr.membershipId, payType: "salary", rate: "62,000" });
    const rows = await listPayProfiles(owner);
    expect(rows.find((r) => r.name === "Ana Member")!.profile).toEqual({ payType: "hourly", payRateCents: 1850 });
    expect(rows.find((r) => r.name === "Max Manager")!.profile).toEqual({ payType: "salary", payRateCents: 6_200_000 });
    expect(rows.find((r) => r.name === "Olive Owner")!.profile).toBeNull();
  });

  it("is for owners only, even managers cannot see or change rates", async () => {
    const { ana, mgr } = await seed("p-b");
    await expect(savePayProfile(mgr, { membershipId: ana.membershipId, payType: "hourly", rate: "20" })).rejects.toThrow(ForbiddenError);
    await expect(listPayProfiles(mgr)).rejects.toThrow(ForbiddenError);
    await expect(listPayProfiles(ana)).rejects.toThrow(ForbiddenError);
  });

  it("rejects nonsense rates and clears a profile", async () => {
    const { owner, ana } = await seed("p-c");
    await expect(savePayProfile(owner, { membershipId: ana.membershipId, payType: "hourly", rate: "abc" })).rejects.toThrow(/dollars/);
    await expect(savePayProfile(owner, { membershipId: ana.membershipId, payType: "hourly", rate: "0" })).rejects.toThrow();
    await expect(savePayProfile(owner, { membershipId: ana.membershipId, payType: "hourly", rate: "5000" })).rejects.toThrow(/too high/);
    await expect(savePayProfile(owner, { membershipId: ana.membershipId, payType: "salary", rate: "30" })).rejects.toThrow(/per year/);
    await savePayProfile(owner, { membershipId: ana.membershipId, payType: "hourly", rate: "20" });
    await savePayProfile(owner, { membershipId: ana.membershipId, payType: "", rate: "" });
    expect((await listPayProfiles(owner)).find((r) => r.name === "Ana Member")!.profile).toBeNull();
  });

  it("keeps amounts out of the audit trail", async () => {
    const { owner, ana, ws } = await seed("p-d");
    await savePayProfile(owner, { membershipId: ana.membershipId, payType: "hourly", rate: "23.45" });
    const rows = await testDb.select().from(auditLog).where(eq(auditLog.workspaceId, ws.id));
    expect(JSON.stringify(rows.filter((r) => r.action === "pay_profile_changed"))).not.toMatch(/2345|23\.45/);
  });

  it("estimates are hidden unless the business turns them on", async () => {
    const off = await seed("p-e");
    await savePayProfile(off.owner, { membershipId: off.ana.membershipId, payType: "hourly", rate: "20" });
    expect((await payProfileMap(off.owner)).size).toBe(0);
    expect((await payProfileMap(off.ana)).size).toBe(0);

    const on = await seed("p-f", { showPayEstimates: true });
    await savePayProfile(on.owner, { membershipId: on.ana.membershipId, payType: "hourly", rate: "20" });
    await savePayProfile(on.owner, { membershipId: on.mgr.membershipId, payType: "hourly", rate: "30" });
    expect((await payProfileMap(on.owner)).size).toBe(2);
    expect((await payProfileMap(on.ana)).size).toBe(0);
    expect((await payProfileMap(on.mgr)).size).toBe(0);
  });

  it("employees see only their own estimate when allowed", async () => {
    const s = await seed("p-g", { showPayEstimates: true, employeesSeeOwnPay: true });
    await savePayProfile(s.owner, { membershipId: s.ana.membershipId, payType: "hourly", rate: "20" });
    await savePayProfile(s.owner, { membershipId: s.mgr.membershipId, payType: "hourly", rate: "30" });
    const m = await payProfileMap(s.ana);
    expect([...m.keys()]).toEqual([s.ana.membershipId]);
  });
});
