import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { auditLog, memberships, stockMovements, user } from "@evergreen/db";

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
const { adjustStock, archiveProduct, listProducts, onHandFor, saveProduct, stockHistory } = await import("./products");
type Ctx = import("./ctx").Ctx;

async function seed(slug: string, role: Ctx["role"] = "owner") {
  const ws = await createBusiness({ name: `Shop ${slug}`, slug });
  const uid = `u-${slug}`;
  await testDb.insert(user).values({ id: uid, name: `Owner ${slug}`, email: `${slug}@x.test` });
  const [m] = await testDb.insert(memberships).values({ workspaceId: ws.id, userId: uid, role }).returning();
  const ctx = { userId: uid, name: "Tester", email: `${slug}@x.test`, role, membershipId: m!.id, workspace: { id: ws.id } } as unknown as Ctx;
  return { ws, ctx };
}

const game = { sku: "game-1", name: "Used game", price: "$19.99", startingStock: 5 };

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url)) });
});
beforeEach(async () => {
  await pg.exec('TRUNCATE workspaces, "user" CASCADE');
});

describe("saveProduct", () => {
  it("creates a product with starting stock and an audit row", async () => {
    const { ctx, ws } = await seed("shop-a");
    const { id } = await saveProduct(ctx, game);
    const [p] = await listProducts(ctx);
    expect(p).toMatchObject({ id, sku: "GAME-1", name: "Used game", priceCents: 1999, onHand: 5, active: true });
    expect((await testDb.select().from(auditLog).where(eq(auditLog.workspaceId, ws.id))).some((a) => a.action === "created")).toBe(true);
    expect((await stockHistory(ctx, { productId: id }))[0]).toMatchObject({ delta: 5, reason: "receive" });
  });

  it("makes no stock row when starting stock is zero", async () => {
    const { ctx, ws } = await seed("shop-a");
    await saveProduct(ctx, { ...game, startingStock: 0 });
    expect((await testDb.select().from(stockMovements).where(eq(stockMovements.workspaceId, ws.id))).length).toBe(0);
  });

  it("rejects a duplicate SKU in any letter case, but allows it in another business", async () => {
    const a = await seed("shop-a");
    const b = await seed("shop-b");
    await saveProduct(a.ctx, game);
    await expect(saveProduct(a.ctx, { ...game, sku: "GAME-1", name: "Other" })).rejects.toThrow(/already uses that SKU/);
    await expect(saveProduct(b.ctx, game)).resolves.toBeTruthy();
  });

  it("blocks reusing the SKU of a removed product", async () => {
    const { ctx } = await seed("shop-a");
    const { id } = await saveProduct(ctx, game);
    await archiveProduct(ctx, { id });
    await expect(saveProduct(ctx, { ...game, name: "New" })).rejects.toThrow(/removed product/);
  });

  it("updates without touching stock, and rejects bad input", async () => {
    const { ctx } = await seed("shop-a");
    const { id } = await saveProduct(ctx, game);
    await saveProduct(ctx, { ...game, id, name: "Renamed", price: "25", startingStock: 99 });
    const [p] = await listProducts(ctx);
    expect(p).toMatchObject({ name: "Renamed", priceCents: 2500, onHand: 5 });
    await expect(saveProduct(ctx, { ...game, sku: "x", price: "abc" })).rejects.toThrow(/price/i);
    await expect(saveProduct(ctx, { ...game, sku: "bad sku!" })).rejects.toThrow();
    await expect(saveProduct(ctx, { ...game, sku: "x2", shippingAllowed: false, pickupAllowed: false })).rejects.toThrow(/shipping or pickup/);
  });

  it("only managers can change products", async () => {
    const { ctx } = await seed("shop-a", "member");
    await expect(saveProduct(ctx, game)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(adjustStock(ctx, { kind: "receive", productId: crypto.randomUUID(), quantity: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listProducts(ctx)).resolves.toEqual([]);
  });
});

describe("listProducts and archiveProduct", () => {
  it("hides inactive and removed products, and never shows another business", async () => {
    const a = await seed("shop-a");
    const b = await seed("shop-b");
    const one = await saveProduct(a.ctx, game);
    await saveProduct(a.ctx, { ...game, sku: "OFF", name: "Hidden", active: false });
    await saveProduct(b.ctx, { ...game, sku: "B-1" });
    expect((await listProducts(a.ctx)).map((p) => p.sku)).toEqual(["GAME-1"]);
    expect((await listProducts(a.ctx, { includeInactive: true })).length).toBe(2);
    await archiveProduct(a.ctx, { id: one.id });
    expect((await listProducts(a.ctx, { includeInactive: true })).map((p) => p.sku)).toEqual(["OFF"]);
    await expect(archiveProduct(b.ctx, { id: one.id })).rejects.toThrow(/not found/);
  });
});

describe("adjustStock", () => {
  it("receives and adjusts, keeping a full history", async () => {
    const { ctx } = await seed("shop-a");
    const { id } = await saveProduct(ctx, game);
    expect(await adjustStock(ctx, { kind: "receive", productId: id, quantity: 3, note: "Trade-in" })).toMatchObject({ onHand: 8 });
    expect(await adjustStock(ctx, { kind: "adjust", productId: id, quantity: -2, note: "Damaged" })).toMatchObject({ onHand: 6 });
    const hist = await stockHistory(ctx, { productId: id });
    expect(hist.map((h) => h.delta).sort()).toEqual([-2, 3, 5]);
    expect((await onHandFor(ctx.workspace.id, [id]))[id]).toBe(6);
  });

  it("will not take stock below zero or accept an adjustment without a reason", async () => {
    const { ctx } = await seed("shop-a");
    const { id } = await saveProduct(ctx, game);
    await expect(adjustStock(ctx, { kind: "adjust", productId: id, quantity: -6, note: "Count" })).rejects.toThrow(/Only 5 in stock/);
    await expect(adjustStock(ctx, { kind: "adjust", productId: id, quantity: -1, note: "" })).rejects.toThrow();
    await expect(adjustStock(ctx, { kind: "adjust", productId: id, quantity: 0, note: "x" })).rejects.toThrow();
    await expect(adjustStock(ctx, { kind: "receive", productId: id, quantity: 0 })).rejects.toThrow();
    expect((await onHandFor(ctx.workspace.id, [id]))[id]).toBe(5);
  });

  it("cannot touch another business's product", async () => {
    const a = await seed("shop-a");
    const b = await seed("shop-b");
    const { id } = await saveProduct(a.ctx, game);
    await expect(adjustStock(b.ctx, { kind: "receive", productId: id, quantity: 1 })).rejects.toThrow(/not found/);
    expect(await stockHistory(b.ctx, { productId: id })).toEqual([]);
  });
});
