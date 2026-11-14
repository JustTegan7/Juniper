import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { memberships, payments, refunds, user } from "@evergreen/db";
import { parseSettings, refundAmounts } from "@evergreen/core";

process.env.HELCIM_ENCRYPTION_KEY = randomBytes(32).toString("base64");
const pg = new PGlite({ extensions: { btree_gist } });
const testDb = drizzle(pg);

vi.mock("server-only", () => ({}));
vi.mock("../email", () => ({ sendEmail: vi.fn(async () => true) }));
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
const { saveProduct, onHandFor } = await import("./products");
const { ForbiddenError } = await import("./ctx");
const { saveHelcimConnection } = await import("./helcim-connection");
const { createOrder, getOrder, payWithCash } = await import("./orders");
const { refundOrder, retryRefund, resolvePendingRefund } = await import("./refunds");
type Ctx = import("./ctx").Ctx;

async function seed(slug: string, taxRatePercent = 0) {
  const ws = await createBusiness({ name: `Shop ${slug}`, slug });
  const uid = `u-${slug}`;
  await testDb.insert(user).values({ id: uid, name: "T", email: `${uid}@x.test` });
  const [m] = await testDb.insert(memberships).values({ workspaceId: ws.id, userId: uid, role: "owner" }).returning();
  const ctx = { userId: uid, name: "T", email: `${uid}@x.test`, role: "owner", membershipId: m!.id, workspace: { id: ws.id, settings: parseSettings({ shop: { taxRatePercent } }) } } as unknown as Ctx;
  const game = await saveProduct(ctx, { sku: "G1", name: "Game", price: "20.00", startingStock: 5 });
  const disc = await saveProduct(ctx, { sku: "D1", name: "Disc", price: "5.50", startingStock: 1 });
  return { ctx, ws, game: game.id, disc: disc.id };
}

const approved = () => vi.fn(async () => new Response(JSON.stringify({ status: "APPROVED", transactionId: "555" }), { status: 200 })) as unknown as typeof fetch;
const status = (s: number) => vi.fn(async () => new Response(null, { status: s })) as unknown as typeof fetch;
const down = () => vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch;

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url)) });
});
beforeEach(async () => {
  await pg.exec('TRUNCATE workspaces, "user" CASCADE');
});

/** Two games ($20) and a disc ($5.50) with 10% tax: subtotal 4550, tax 455, total 5005. */
async function paidOrder(slug: string, card = false) {
  const s = await seed(slug, 10);
  const o = await createOrder(s.ctx, { items: [{ productId: s.game, quantity: 2 }, { productId: s.disc, quantity: 1 }] });
  await payWithCash(s.ctx, { orderId: o.id });
  if (card) {
    await saveHelcimConnection(s.ctx, { apiToken: "api-token-12345", verifierToken: "dmVyaWZpZXI=" });
    await testDb.update(payments).set({ raw: null, helcimTransactionId: "999" }).where(eq(payments.orderId, o.id));
  }
  const full = await getOrder(s.ctx, o.id);
  const line = (sku: string) => full!.items.find((i) => i.sku === sku)!.id;
  return { ...s, orderId: o.id, gameLine: line("G1"), discLine: line("D1") };
}

const stock = async (s: { ws: { id: string }; game: string }) => (await onHandFor(s.ws.id, [s.game]))[s.game];

describe("refundAmounts", () => {
  const o = { subtotalCents: 4550, taxCents: 455, shippingCents: 500 };
  it("shares tax by item value and lets the last refund take the rounding", () => {
    expect(refundAmounts(o, [{ unitPriceCents: 2000, quantity: 1 }], { tax: 0, shipping: 0 }, false, false)).toMatchObject({ taxCents: 200, totalCents: 2200 });
    expect(refundAmounts(o, [{ unitPriceCents: 2550, quantity: 1 }], { tax: 200, shipping: 0 }, true, true)).toMatchObject({ taxCents: 255, shippingCents: 500, totalCents: 3305 });
  });
});

describe("cash refunds", () => {
  it("refunds part of an order, puts stock back, and keeps the order paid", async () => {
    const s = await paidOrder("shop-a");
    expect(await stock(s)).toBe(3);
    const r = await refundOrder(s.ctx, { orderId: s.orderId, items: [{ orderItemId: s.gameLine, quantity: 1 }], reason: "Disc scratched" });
    expect(r.message).toMatch(/22\.00/);
    expect(await stock(s)).toBe(4);
    expect((await getOrder(s.ctx, s.orderId))!.order.status).toBe("paid");
    const [row] = await testDb.select().from(refunds);
    expect(row).toMatchObject({ method: "cash", status: "approved", amountCents: 2200, taxCents: 200 });
  });

  it("finishes the order exactly: two parts add up to the total, status becomes refunded", async () => {
    const s = await paidOrder("shop-a");
    await refundOrder(s.ctx, { orderId: s.orderId, items: [{ orderItemId: s.gameLine, quantity: 2 }], reason: "Returned" });
    await refundOrder(s.ctx, { orderId: s.orderId, items: [{ orderItemId: s.discLine, quantity: 1 }], reason: "Returned" });
    const rows = await testDb.select().from(refunds);
    expect(rows.reduce((n, r) => n + r.amountCents, 0)).toBe(5005);
    expect((await getOrder(s.ctx, s.orderId))!.order.status).toBe("refunded");
    expect(await stock(s)).toBe(5);
    await expect(refundOrder(s.ctx, { orderId: s.orderId, items: [{ orderItemId: s.gameLine, quantity: 1 }], reason: "again" })).rejects.toThrow(/Only a paid order/);
  });

  it("does not let you refund more than was sold, or an empty refund", async () => {
    const s = await paidOrder("shop-a");
    await refundOrder(s.ctx, { orderId: s.orderId, items: [{ orderItemId: s.gameLine, quantity: 1 }], reason: "x" });
    await expect(refundOrder(s.ctx, { orderId: s.orderId, items: [{ orderItemId: s.gameLine, quantity: 2 }], reason: "x" })).rejects.toThrow(/only 1 left/);
    await expect(refundOrder(s.ctx, { orderId: s.orderId, items: [], reason: "x" })).rejects.toThrow(/Choose what/);
    await expect(refundOrder(s.ctx, { orderId: s.orderId, items: [{ orderItemId: s.gameLine, quantity: 1 }], reason: "  " })).rejects.toThrow();
  });

  it("leaves stock alone when the item is not put back", async () => {
    const s = await paidOrder("shop-a");
    await refundOrder(s.ctx, { orderId: s.orderId, items: [{ orderItemId: s.gameLine, quantity: 1 }], restock: false, reason: "Damaged, thrown out" });
    expect(await stock(s)).toBe(3);
  });

  it("is for managers only", async () => {
    const s = await paidOrder("shop-a");
    const staff = { ...s.ctx, role: "member" } as Ctx;
    await expect(refundOrder(staff, { orderId: s.orderId, items: [{ orderItemId: s.gameLine, quantity: 1 }], reason: "x" })).rejects.toThrow(ForbiddenError);
  });
});

describe("card refunds", () => {
  it("sends the amount and a stable key to Helcim and settles on approval", async () => {
    const s = await paidOrder("shop-a", true);
    const f = approved();
    await refundOrder(s.ctx, { orderId: s.orderId, items: [{ orderItemId: s.gameLine, quantity: 1 }], reason: "Return" }, f);
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toContain("/payment/refund");
    expect(JSON.parse(String(init.body))).toMatchObject({ originalTransactionId: 999, amount: 22 });
    const [row] = await testDb.select().from(refunds);
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe(row!.idempotencyKey);
    expect(row).toMatchObject({ status: "approved", method: "card", helcimTransactionId: "555" });
    expect(await stock(s)).toBe(4);
  });

  it("changes nothing when Helcim refuses, and the items can be refunded again", async () => {
    const s = await paidOrder("shop-a", true);
    await expect(refundOrder(s.ctx, { orderId: s.orderId, items: [{ orderItemId: s.gameLine, quantity: 1 }], reason: "Return" }, status(400))).rejects.toThrow(/Nothing was changed/);
    expect(await stock(s)).toBe(3);
    expect((await testDb.select().from(refunds))[0]!.status).toBe("failed");
    await refundOrder(s.ctx, { orderId: s.orderId, items: [{ orderItemId: s.gameLine, quantity: 1 }], reason: "Return" }, approved());
    expect(await stock(s)).toBe(4);
  });

  it("stays pending when Helcim cannot be reached, blocks a second refund, and retry reuses the key", async () => {
    const s = await paidOrder("shop-a", true);
    await expect(refundOrder(s.ctx, { orderId: s.orderId, items: [{ orderItemId: s.gameLine, quantity: 1 }], reason: "Return" }, down())).rejects.toThrow(/Could not confirm/);
    const [pending] = await testDb.select().from(refunds);
    expect(pending!.status).toBe("pending");
    expect(await stock(s)).toBe(3);
    await expect(refundOrder(s.ctx, { orderId: s.orderId, items: [{ orderItemId: s.discLine, quantity: 1 }], reason: "x" }, approved())).rejects.toThrow(/still waiting/);
    const f = approved();
    await retryRefund(s.ctx, { refundId: pending!.id }, f);
    const [, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe(pending!.idempotencyKey);
    expect((await testDb.select().from(refunds))[0]!.status).toBe("approved");
    expect(await stock(s)).toBe(4);
  });

  it("a manager can record a pending refund as done by hand, or clear it", async () => {
    const s = await paidOrder("shop-a", true);
    await expect(refundOrder(s.ctx, { orderId: s.orderId, items: [{ orderItemId: s.gameLine, quantity: 1 }], reason: "Return" }, down())).rejects.toThrow();
    const [p] = await testDb.select().from(refunds);
    await expect(resolvePendingRefund(s.ctx, { refundId: p!.id, outcome: "approved", note: " " })).rejects.toThrow();
    await resolvePendingRefund(s.ctx, { refundId: p!.id, outcome: "approved", note: "Refunded in Helcim dashboard" });
    expect(await stock(s)).toBe(4);
    await expect(resolvePendingRefund(s.ctx, { refundId: p!.id, outcome: "cleared", note: "x" })).rejects.toThrow(/not waiting/);
  });

  it("clearing a pending refund moves nothing", async () => {
    const s = await paidOrder("shop-a", true);
    await expect(refundOrder(s.ctx, { orderId: s.orderId, items: [{ orderItemId: s.gameLine, quantity: 1 }], reason: "Return" }, down())).rejects.toThrow();
    const [p] = await testDb.select().from(refunds);
    await resolvePendingRefund(s.ctx, { refundId: p!.id, outcome: "cleared", note: "Helcim shows no refund" });
    expect(await stock(s)).toBe(3);
    expect((await testDb.select().from(refunds))[0]!.status).toBe("failed");
  });

  it("will not refund a card payment with no Helcim transaction on file", async () => {
    const s = await paidOrder("shop-a", true);
    await testDb.update(payments).set({ helcimTransactionId: null }).where(eq(payments.orderId, s.orderId));
    await expect(refundOrder(s.ctx, { orderId: s.orderId, items: [{ orderItemId: s.gameLine, quantity: 1 }], reason: "x" }, approved())).rejects.toThrow(/no Helcim transaction/);
    expect(await stock(s)).toBe(3);
  });
});
