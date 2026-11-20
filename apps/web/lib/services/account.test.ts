import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { account, memberships, pushTokens, session, user, workspaces } from "@evergreen/db";
import { eq } from "drizzle-orm";

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
const { deleteAccount } = await import("./account");
type Ctx = import("./ctx").Ctx;

async function person(wsId: string, slug: string, name: string, role: Ctx["role"]) {
  const uid = `u-${slug}-${name}`;
  await testDb.insert(user).values({ id: uid, name, email: `${uid}@x.test` });
  const [m] = await testDb.insert(memberships).values({ workspaceId: wsId, userId: uid, role, bio: "hello" }).returning();
  return { userId: uid, name, email: `${uid}@x.test`, role, membershipId: m!.id, workspace: { id: wsId } } as unknown as Ctx;
}

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url)) });
});
beforeEach(async () => {
  await pg.exec('TRUNCATE workspaces, "user" CASCADE');
});

describe("deleteAccount", () => {
  it("needs the exact email", async () => {
    const ws = await createBusiness({ name: "Shop", slug: "d-a" });
    const owner = await person(ws.id, "d-a", "Olive", "owner");
    const ana = await person(ws.id, "d-a", "Ana", "member");
    await expect(deleteAccount(ana, { confirm: "nope@x.test" })).rejects.toThrow(/email address exactly/);
    expect(owner.userId).not.toBe(ana.userId);
  });

  it("removes a teammate, wipes their login and name, and leaves everyone else alone", async () => {
    const ws = await createBusiness({ name: "Shop", slug: "d-b" });
    const owner = await person(ws.id, "d-b", "Olive", "owner");
    const ana = await person(ws.id, "d-b", "Ana", "member");
    await testDb.insert(session).values({ id: "s1", token: "t1", userId: ana.userId, expiresAt: new Date(Date.now() + 1e7) });
    await testDb.insert(account).values({ id: "a1", accountId: ana.userId, providerId: "credential", userId: ana.userId, password: "hash" });
    await testDb.insert(pushTokens).values({ workspaceId: ws.id, membershipId: ana.membershipId, token: "ExponentPushToken[abcdefghijkl]", platform: "ios", lastSeenAt: new Date() });

    const res = await deleteAccount(ana, { confirm: ` ${ana.email.toUpperCase()} ` });
    expect(res.message).toMatch(/deleted/);

    const [u] = await testDb.select().from(user).where(eq(user.id, ana.userId));
    expect(u).toMatchObject({ name: "Former team member", image: null });
    expect(u!.email).toBe(`deleted-${ana.userId}@deleted.invalid`);
    expect(await testDb.select().from(session).where(eq(session.userId, ana.userId))).toHaveLength(0);
    expect(await testDb.select().from(account).where(eq(account.userId, ana.userId))).toHaveLength(0);
    expect(await testDb.select().from(pushTokens)).toHaveLength(0);
    const [m] = await testDb.select().from(memberships).where(eq(memberships.id, ana.membershipId));
    expect(m!.deletedAt).not.toBeNull();
    expect(m).toMatchObject({ bookable: false, bio: null });

    const [o] = await testDb.select().from(memberships).where(eq(memberships.id, owner.membershipId));
    expect(o!.deletedAt).toBeNull();
    const [w] = await testDb.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(w!.deletedAt).toBeNull();
  });

  it("will not leave a business with people but no owner", async () => {
    const ws = await createBusiness({ name: "Shop", slug: "d-c" });
    const owner = await person(ws.id, "d-c", "Olive", "owner");
    await person(ws.id, "d-c", "Ana", "member");
    await expect(deleteAccount(owner, { confirm: owner.email })).rejects.toThrow(/only owner of Shop/);
    const [u] = await testDb.select().from(user).where(eq(user.id, owner.userId));
    expect(u!.name).toBe("Olive");
  });

  it("lets a second owner take over, and deactivates a business when its last person leaves", async () => {
    const ws = await createBusiness({ name: "Shop", slug: "d-d" });
    const one = await person(ws.id, "d-d", "Olive", "owner");
    const two = await person(ws.id, "d-d", "Omar", "owner");
    await deleteAccount(one, { confirm: one.email });
    expect((await testDb.select().from(workspaces).where(eq(workspaces.id, ws.id)))[0]!.deletedAt).toBeNull();
    await deleteAccount(two, { confirm: two.email });
    expect((await testDb.select().from(workspaces).where(eq(workspaces.id, ws.id)))[0]!.deletedAt).not.toBeNull();
  });
});
