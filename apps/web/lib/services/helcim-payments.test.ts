import { createHmac, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import { auditLog, helcimConnections, helcimDevices, orderItems, orders, payments, products, stockMovements, webhookEvents } from "@evergreen/db";

// Real Postgres (PGlite) with the real migrations, so the unique indexes behave as in production.
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

const KEY = randomBytes(32).toString("base64");
process.env.HELCIM_ENCRYPTION_KEY = KEY;

const { createBusiness } = await import("./workspace");
const { resolveCardTransaction, resolveTerminalCancel } = await import("./helcim-payments");
const { handleHelcimWebhook } = await import("./helcim-webhook");
const { encryptSecret } = await import("../helcim/crypto");

const NOW = new Date("2026-11-13T22:00:00Z");
type Txn = import("../helcim/client").CardTransaction;
const txn = (o: Partial<Txn> = {}): Txn => ({ transactionId: "T1", status: "approved", amountCents: 3000, invoiceNumber: "1001", deviceCode: "FD4Y", raw: { ok: true }, ...o });

async function seed(slug: string) {
  const ws = await createBusiness({ name: `Shop ${slug}`, slug });
  const verifier = randomBytes(24).toString("base64");
  const [conn] = await testDb
    .insert(helcimConnections)
    .values({ workspaceId: ws.id, connectionKey: `key-${slug}`, apiTokenEnc: encryptSecret("api-token"), verifierTokenEnc: encryptSecret(verifier) })
    .returning();
  const [device] = await testDb.insert(helcimDevices).values({ workspaceId: ws.id, connectionId: conn!.id, code: "FD4Y", kind: "smart_terminal", label: "Counter" }).returning();
  const [p1] = await testDb.insert(products).values({ workspaceId: ws.id, sku: "GAME-1", name: "Game", priceCents: 1000 }).returning();
  const [p2] = await testDb.insert(products).values({ workspaceId: ws.id, sku: "CTRL-1", name: "Controller", priceCents: 1000 }).returning();
  // Starting stock of 10 each.
  await testDb.insert(stockMovements).values([
    { workspaceId: ws.id, productId: p1!.id, delta: 10, reason: "receive" },
    { workspaceId: ws.id, productId: p2!.id, delta: 10, reason: "receive" },
  ]);
  let n = 1000;
  async function sale(opts: { total?: number; status?: "draft" | "awaiting_payment" | "cancelled"; payStatus?: "pending" | "cancelled" | "declined" } = {}) {
    n++;
    const total = opts.total ?? 3000;
    const [o] = await testDb
      .insert(orders)
      .values({ workspaceId: ws.id, orderNumber: n, channel: "in_person", status: opts.status ?? "awaiting_payment", subtotalCents: total, totalCents: total })
      .returning();
    await testDb.insert(orderItems).values([
      { workspaceId: ws.id, orderId: o!.id, productId: p1!.id, sku: "GAME-1", name: "Game", unitPriceCents: 1000, quantity: 2 },
      { workspaceId: ws.id, orderId: o!.id, productId: p2!.id, sku: "CTRL-1", name: "Controller", unitPriceCents: 1000, quantity: 1 },
    ]);
    const [pay] = await testDb
      .insert(payments)
      .values({ workspaceId: ws.id, orderId: o!.id, channel: "in_person", status: opts.payStatus ?? "pending", amountCents: total, deviceId: opts.payStatus && opts.payStatus !== "pending" ? null : device!.id, idempotencyKey: `idem${n}`.padEnd(25, "x") })
      .returning();
    return { order: o!, payment: pay!, invoice: String(n) };
  }
  return { ws, conn: conn!, verifier, device: device!, p1: p1!, p2: p2!, sale };
}

const onHand = async (ws: string, productId: string) => (await testDb.select().from(stockMovements).where(and(eq(stockMovements.workspaceId, ws), eq(stockMovements.productId, productId)))).reduce((a, r) => a + r.delta, 0);
const orderOf = async (id: string) => (await testDb.select().from(orders).where(eq(orders.id, id)))[0]!;
const payOf = async (id: string) => (await testDb.select().from(payments).where(eq(payments.id, id)))[0]!;

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url)) });
});
beforeEach(async () => {
  await pg.exec("TRUNCATE workspaces, \"user\" CASCADE");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("resolveCardTransaction", () => {
  it("approved: marks paid, takes stock out once, and audits", async () => {
    const s = await seed("shop-a");
    const sale = await s.sale();
    expect(await resolveCardTransaction(s.ws.id, txn({ invoiceNumber: sale.invoice }), NOW)).toBe("paid");
    expect((await orderOf(sale.order.id)).status).toBe("paid");
    const pay = await payOf(sale.payment.id);
    expect(pay.status).toBe("approved");
    expect(pay.helcimTransactionId).toBe("T1");
    expect(await onHand(s.ws.id, s.p1.id)).toBe(8);
    expect(await onHand(s.ws.id, s.p2.id)).toBe(9);
    expect((await testDb.select().from(auditLog).where(eq(auditLog.entityId, sale.payment.id))).length).toBe(1);
  });

  it("replaying the same transaction changes nothing", async () => {
    const s = await seed("shop-a");
    const sale = await s.sale();
    await resolveCardTransaction(s.ws.id, txn({ invoiceNumber: sale.invoice }), NOW);
    expect(await resolveCardTransaction(s.ws.id, txn({ invoiceNumber: sale.invoice }), NOW)).toBe("already_paid");
    expect(await onHand(s.ws.id, s.p1.id)).toBe(8);
    expect((await testDb.select().from(auditLog).where(eq(auditLog.entityId, sale.payment.id))).length).toBe(1);
  });

  it("finishes a half done run: payment approved but stock never written", async () => {
    const s = await seed("shop-a");
    const sale = await s.sale();
    await testDb.update(payments).set({ status: "approved", helcimTransactionId: "T1" }).where(eq(payments.id, sale.payment.id));
    expect(await resolveCardTransaction(s.ws.id, txn({ invoiceNumber: sale.invoice }), NOW)).toBe("already_paid");
    expect((await orderOf(sale.order.id)).status).toBe("paid");
    expect(await onHand(s.ws.id, s.p1.id)).toBe(8);
  });

  it("declined: no stock, order reopened for another try", async () => {
    const s = await seed("shop-a");
    const sale = await s.sale();
    expect(await resolveCardTransaction(s.ws.id, txn({ invoiceNumber: sale.invoice, status: "declined" }), NOW)).toBe("declined");
    expect((await payOf(sale.payment.id)).status).toBe("declined");
    expect((await orderOf(sale.order.id)).status).toBe("draft");
    expect(await onHand(s.ws.id, s.p1.id)).toBe(10);
  });

  it("amount mismatch: flags for review and takes no stock", async () => {
    const s = await seed("shop-a");
    const sale = await s.sale();
    expect(await resolveCardTransaction(s.ws.id, txn({ invoiceNumber: sale.invoice, amountCents: 2500 }), NOW)).toBe("needs_review");
    const pay = await payOf(sale.payment.id);
    expect(pay.needsReview).toBe(true);
    expect(pay.status).toBe("pending");
    expect(await onHand(s.ws.id, s.p1.id)).toBe(10);
  });

  it("approved for a payment already cancelled: flags, no stock", async () => {
    const s = await seed("shop-a");
    const sale = await s.sale({ payStatus: "cancelled" });
    expect(await resolveCardTransaction(s.ws.id, txn({ invoiceNumber: sale.invoice }), NOW)).toBe("needs_review");
    expect(await onHand(s.ws.id, s.p1.id)).toBe(10);
  });

  it("approved for an order that was cancelled meanwhile: flags, no stock", async () => {
    const s = await seed("shop-a");
    const sale = await s.sale({ status: "cancelled" });
    expect(await resolveCardTransaction(s.ws.id, txn({ invoiceNumber: sale.invoice }), NOW)).toBe("needs_review");
    expect(await onHand(s.ws.id, s.p1.id)).toBe(10);
  });

  it("falls back to device, amount and pending when the invoice number is missing, and flags it", async () => {
    const s = await seed("shop-a");
    const sale = await s.sale();
    expect(await resolveCardTransaction(s.ws.id, txn({ invoiceNumber: null }), NOW)).toBe("paid");
    expect((await payOf(sale.payment.id)).needsReview).toBe(true);
  });

  it("never matches another business's order number", async () => {
    const a = await seed("shop-a");
    const b = await seed("shop-b");
    const sale = await a.sale();
    expect(await resolveCardTransaction(b.ws.id, txn({ invoiceNumber: sale.invoice, deviceCode: null }), NOW)).toBe("no_match");
    expect(await onHand(a.ws.id, a.p1.id)).toBe(10);
  });

  it("ignores a transaction that is neither approved nor declined", async () => {
    const s = await seed("shop-a");
    const sale = await s.sale();
    expect(await resolveCardTransaction(s.ws.id, txn({ invoiceNumber: sale.invoice, status: "other" }), NOW)).toBe("ignored");
    expect((await payOf(sale.payment.id)).status).toBe("pending");
  });
});

describe("database guards", () => {
  it("allows only one pending payment per device", async () => {
    const s = await seed("shop-a");
    await s.sale();
    await expect(s.sale()).rejects.toThrow();
  });
  it("allows only one sale row per order and product", async () => {
    const s = await seed("shop-a");
    const sale = await s.sale();
    const row = { workspaceId: s.ws.id, productId: s.p1.id, delta: -1, reason: "sale" as const, orderId: sale.order.id };
    await testDb.insert(stockMovements).values(row);
    await expect(testDb.insert(stockMovements).values(row)).rejects.toThrow();
  });
});

describe("resolveTerminalCancel", () => {
  it("cancels a pending payment, frees the device and reopens the order", async () => {
    const s = await seed("shop-a");
    const sale = await s.sale();
    expect(await resolveTerminalCancel(s.ws.id, { invoiceNumber: sale.invoice, deviceCode: "FD4Y", transactionAmount: 30 }, NOW)).toBe("cancelled");
    expect((await payOf(sale.payment.id)).status).toBe("cancelled");
    expect((await orderOf(sale.order.id)).status).toBe("draft");
    await expect(s.sale()).resolves.toBeTruthy();
  });
  it("does not cancel a payment that already settled", async () => {
    const s = await seed("shop-a");
    const sale = await s.sale();
    await resolveCardTransaction(s.ws.id, txn({ invoiceNumber: sale.invoice }), NOW);
    expect(await resolveTerminalCancel(s.ws.id, { invoiceNumber: sale.invoice }, NOW)).toBe("ignored");
    expect((await payOf(sale.payment.id)).status).toBe("approved");
  });
});

describe("handleHelcimWebhook", () => {
  const sign = (verifier: string, id: string, ts: string, body: string) => `v1,${createHmac("sha256", Buffer.from(verifier, "base64")).update(`${id}.${ts}.${body}`).digest("base64")}`;
  const ts = String(Math.floor(NOW.getTime() / 1000));

  async function call(s: Awaited<ReturnType<typeof seed>>, body: object, opts: { id?: string; fetchTransaction?: () => Promise<Txn>; badSig?: boolean; key?: string } = {}) {
    const raw = JSON.stringify(body);
    const id = opts.id ?? "msg_1";
    return handleHelcimWebhook({
      connectionKey: opts.key ?? s.conn.connectionKey,
      rawBody: raw,
      headers: { id, timestamp: ts, signature: opts.badSig ? "v1,AAAA" : sign(s.verifier, id, ts, raw) },
      now: NOW,
      fetchTransaction: opts.fetchTransaction ?? (async () => txn()),
    });
  }

  it("rejects bad signatures and unknown connections without touching anything", async () => {
    const s = await seed("shop-a");
    const sale = await s.sale();
    expect((await call(s, { id: "9", type: "cardTransaction" }, { badSig: true })).status).toBe(401);
    expect((await call(s, { id: "9", type: "cardTransaction" }, { key: "nope" })).status).toBe(404);
    expect((await orderOf(sale.order.id)).status).toBe("awaiting_payment");
    expect((await testDb.select().from(webhookEvents)).length).toBe(0);
  });

  it("settles a payment from a signed cardTransaction event and dedupes the replay", async () => {
    const s = await seed("shop-a");
    const sale = await s.sale();
    const fetchTransaction = vi.fn(async () => txn({ invoiceNumber: sale.invoice }));
    const first = await call(s, { id: "77", type: "cardTransaction" }, { fetchTransaction });
    expect(first).toEqual({ status: 200, body: { ok: true, result: "paid" } });
    const again = await call(s, { id: "77", type: "cardTransaction" }, { fetchTransaction });
    expect(again.body.result).toBe("duplicate");
    expect(fetchTransaction).toHaveBeenCalledTimes(1);
    expect(await onHand(s.ws.id, s.p1.id)).toBe(8);
  });

  it("returns 500 when the Helcim lookup fails, and the retry then succeeds", async () => {
    const s = await seed("shop-a");
    const sale = await s.sale();
    const bad = await call(s, { id: "77", type: "cardTransaction" }, { fetchTransaction: async () => { throw new Error("down"); } });
    expect(bad.status).toBe(500);
    expect((await orderOf(sale.order.id)).status).toBe("awaiting_payment");
    const retry = await call(s, { id: "77", type: "cardTransaction" }, { fetchTransaction: async () => txn({ invoiceNumber: sale.invoice }) });
    expect(retry.body.result).toBe("paid");
  });

  it("handles terminalCancel and ignores other event types", async () => {
    const s = await seed("shop-a");
    const sale = await s.sale();
    const c = await call(s, { type: "terminalCancel", invoiceNumber: sale.invoice, deviceCode: "FD4Y", transactionAmount: 30 }, { id: "msg_c" });
    expect(c.body.result).toBe("cancelled");
    const o = await call(s, { type: "somethingNew" }, { id: "msg_o" });
    expect(o).toEqual({ status: 200, body: { ok: true, result: "ignored_type" } });
  });
});
