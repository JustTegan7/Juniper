import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { auditLog, helcimConnections, memberships, user } from "@evergreen/db";

const KEY = randomBytes(32).toString("base64");
process.env.HELCIM_ENCRYPTION_KEY = KEY;
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
const { decryptSecret } = await import("../helcim/crypto");
const { loadHelcimSettings, saveHelcimConnection, saveHelcimDevice } = await import("./helcim-connection");
type Ctx = import("./ctx").Ctx;

async function seed(slug: string, role: Ctx["role"] = "owner") {
  const ws = await createBusiness({ name: `Shop ${slug}`, slug });
  const uid = `u-${slug}-${role}`;
  await testDb.insert(user).values({ id: uid, name: "T", email: `${uid}@x.test` });
  const [m] = await testDb.insert(memberships).values({ workspaceId: ws.id, userId: uid, role }).returning();
  return { ws, ctx: { userId: uid, name: "T", email: `${uid}@x.test`, role, membershipId: m!.id, workspace: { id: ws.id } } as unknown as Ctx };
}

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url)) });
});
beforeEach(async () => {
  await pg.exec('TRUNCATE workspaces, "user" CASCADE');
});

describe("helcim connection", () => {
  it("connects, stores tokens encrypted, and never returns them", async () => {
    const { ctx, ws } = await seed("shop-a");
    expect((await loadHelcimSettings(ctx)).connected).toBe(false);
    await saveHelcimConnection(ctx, { apiToken: "api-token-12345", verifierToken: "dmVyaWZpZXI=", currency: "USD" });
    const s = await loadHelcimSettings(ctx);
    expect(s).toMatchObject({ connected: true, hasVerifierToken: true, currency: "USD" });
    expect(s.connectionKey).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(JSON.stringify(s)).not.toContain("api-token-12345");
    const [row] = await testDb.select().from(helcimConnections).where(eq(helcimConnections.workspaceId, ws.id));
    expect(row!.apiTokenEnc).not.toContain("api-token-12345");
    expect(decryptSecret(row!.apiTokenEnc)).toBe("api-token-12345");
    const audits = await testDb.select().from(auditLog).where(eq(auditLog.workspaceId, ws.id));
    expect(JSON.stringify(audits)).not.toContain("api-token-12345");
  });

  it("requires an API token to connect, and keeps saved tokens when fields are blank", async () => {
    const { ctx, ws } = await seed("shop-a");
    await expect(saveHelcimConnection(ctx, { currency: "USD" })).rejects.toThrow(/API token/);
    await saveHelcimConnection(ctx, { apiToken: "api-token-12345", currency: "USD" });
    expect((await loadHelcimSettings(ctx)).hasVerifierToken).toBe(false);
    await saveHelcimConnection(ctx, { apiToken: "", verifierToken: "dmVyaWZpZXI=", currency: "CAD" });
    const [row] = await testDb.select().from(helcimConnections).where(eq(helcimConnections.workspaceId, ws.id));
    expect(decryptSecret(row!.apiTokenEnc)).toBe("api-token-12345");
    expect(decryptSecret(row!.verifierTokenEnc!)).toBe("dmVyaWZpZXI=");
    expect(row!.currency).toBe("CAD");
  });

  it("is owner only", async () => {
    const { ctx } = await seed("shop-a", "manager");
    await expect(saveHelcimConnection(ctx, { apiToken: "api-token-12345" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveHelcimDevice(ctx, { code: "AB12", kind: "card_reader", label: "x" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keeps businesses separate", async () => {
    const a = await seed("shop-a");
    const b = await seed("shop-b");
    await saveHelcimConnection(a.ctx, { apiToken: "api-token-12345" });
    expect((await loadHelcimSettings(b.ctx)).connected).toBe(false);
  });
});

describe("helcim devices", () => {
  it("needs a connection first, then adds, edits and turns devices off", async () => {
    const { ctx } = await seed("shop-a");
    await expect(saveHelcimDevice(ctx, { code: "ab12", kind: "smart_terminal", label: "Front" })).rejects.toThrow(/Connect Helcim first/);
    await saveHelcimConnection(ctx, { apiToken: "api-token-12345" });
    const { id } = await saveHelcimDevice(ctx, { code: "ab12", kind: "smart_terminal", label: "Front counter" });
    expect((await loadHelcimSettings(ctx)).devices[0]).toMatchObject({ code: "AB12", label: "Front counter", active: true });
    await saveHelcimDevice(ctx, { id, code: "AB12", kind: "smart_terminal", label: "Front counter", active: false });
    expect((await loadHelcimSettings(ctx)).devices[0]!.active).toBe(false);
  });

  it("rejects duplicate and malformed codes", async () => {
    const { ctx } = await seed("shop-a");
    await saveHelcimConnection(ctx, { apiToken: "api-token-12345" });
    await saveHelcimDevice(ctx, { code: "AB12", kind: "card_reader", label: "One" });
    await expect(saveHelcimDevice(ctx, { code: "ab12", kind: "card_reader", label: "Two" })).rejects.toThrow(/already added/);
    await expect(saveHelcimDevice(ctx, { code: "ABC", kind: "card_reader", label: "Two" })).rejects.toThrow(/4 characters/);
  });
});
