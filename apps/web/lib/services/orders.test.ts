import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { memberships, orders, payments, stockMovements, user } from "@evergreen/db";
import { parseSettings } from "@evergreen/core";

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
const { sendEmail } = await import("../email");
const { saveProduct, onHandFor } = await import("./products");
const { saveHelcimConnection, saveHelcimDevice, loadHelcimSettings } = await import("./helcim-connection");
const { resolveCardTransaction } = await import("./helcim-payments");
const { fulfillOrder, listOrdersForStaff, resolveReview, emailReceipt, reapStalePayments, abandonPayment, cancelOrder, chargeCard, createOrder, getOrder, payWithCash, taxFor } = await import("./orders");
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

async function withDevice(ctx: Ctx, code = "AB12") {
  await saveHelcimConnection(ctx, { apiToken: "api-token-12345", verifierToken: "dmVyaWZpZXI=" });
  const { id } = await saveHelcimDevice(ctx, { code, kind: "smart_terminal", label: "Front" });
  return id!;
}

const ok = () => vi.fn(async () => new Response(null, { status: 202 })) as unknown as typeof fetch;
const status = (s: number) => vi.fn(async () => new Response(null, { status: s })) as unknown as typeof fetch;

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url)) });
});
beforeEach(async () => {
  await pg.exec('TRUNCATE workspaces, "user" CASCADE');
});

describe("createOrder", () => {
  it("prices from the database, adds tax, numbers orders per business", async () => {
    const a = await seed("shop-a", 10);
    const b = await seed("shop-b");
    const o1 = await createOrder(a.ctx, { items: [{ productId: a.game, quantity: 2 }, { productId: a.game, quantity: 1 }, { productId: a.disc, quantity: 1 }] });
    expect(o1.orderNumber).toBe(1);
    expect(o1.totalCents).toBe(6550 + 655);
    const o2 = await createOrder(a.ctx, { items: [{ productId: a.game, quantity: 1 }] });
    expect(o2.orderNumber).toBe(2);
    expect((await createOrder(b.ctx, { items: [{ productId: b.game, quantity: 1 }] })).orderNumber).toBe(1);
    const full = await getOrder(a.ctx, o1.id);
    expect(full!.items.map((i) => [i.sku, i.quantity]).sort()).toEqual([["D1", 1], ["G1", 3]]);
  });

  it("rejects out of stock, other business products and empty carts", async () => {
    const a = await seed("shop-a");
    const b = await seed("shop-b");
    await expect(createOrder(a.ctx, { items: [{ productId: a.disc, quantity: 2 }] })).rejects.toThrow(/only 1 in stock/);
    await expect(createOrder(a.ctx, { items: [{ productId: b.game, quantity: 1 }] })).rejects.toThrow(/no longer for sale/);
    await expect(createOrder(a.ctx, { items: [] })).rejects.toThrow();
  });

  it("rounds tax to the cent", () => {
    expect(taxFor(1999, 10.3)).toBe(206);
    expect(taxFor(1000, 0)).toBe(0);
  });
});

describe("payWithCash", () => {
  it("marks paid, takes stock out, and a second tap changes nothing", async () => {
    const { ctx, ws, game } = await seed("shop-a");
    const o = await createOrder(ctx, { items: [{ productId: game, quantity: 2 }] });
    await payWithCash(ctx, { orderId: o.id });
    expect((await getOrder(ctx, o.id))!.order).toMatchObject({ status: "paid" });
    expect((await onHandFor(ws.id, [game]))[game]).toBe(3);
    await expect(payWithCash(ctx, { orderId: o.id })).rejects.toThrow(/already paid/);
    expect((await onHandFor(ws.id, [game]))[game]).toBe(3);
    expect((await testDb.select().from(payments).where(eq(payments.orderId, o.id))).length).toBe(1);
  });

  it("refuses if stock sold elsewhere in the meantime", async () => {
    const { ctx, disc } = await seed("shop-a");
    const o1 = await createOrder(ctx, { items: [{ productId: disc, quantity: 1 }] });
    const o2 = await createOrder(ctx, { items: [{ productId: disc, quantity: 1 }] });
    await payWithCash(ctx, { orderId: o1.id });
    await expect(payWithCash(ctx, { orderId: o2.id })).rejects.toThrow(/only 0 in stock/);
  });
});

describe("chargeCard", () => {
  it("sends the invoice number and amount, holds stock until the webhook settles", async () => {
    const { ctx, ws, game } = await seed("shop-a");
    const deviceId = await withDevice(ctx);
    const o = await createOrder(ctx, { items: [{ productId: game, quantity: 2 }] });
    const f = ok();
    await chargeCard(ctx, { orderId: o.id, deviceId }, f);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/devices/AB12/payment/purchase");
    expect(JSON.parse(init.body as string)).toMatchObject({ transactionAmount: 40, invoiceNumber: "1" });
    expect((await getOrder(ctx, o.id))!.order.status).toBe("awaiting_payment");
    expect((await onHandFor(ws.id, [game]))[game]).toBe(5);
    // Helcim says it was approved.
    const r = await resolveCardTransaction(ws.id, { transactionId: "t1", status: "approved", amountCents: 4000, invoiceNumber: "1", deviceCode: "AB12", raw: {} } as never, new Date());
    expect(r).toBe("paid");
    expect((await onHandFor(ws.id, [game]))[game]).toBe(3);
  });

  it("reopens the order when Helcim says nothing was sent", async () => {
    const { ctx, game } = await seed("shop-a");
    const deviceId = await withDevice(ctx);
    const o = await createOrder(ctx, { items: [{ productId: game, quantity: 1 }] });
    await expect(chargeCard(ctx, { orderId: o.id, deviceId }, status(409))).rejects.toThrow();
    expect((await getOrder(ctx, o.id))!.order.status).toBe("draft");
    expect((await getOrder(ctx, o.id))!.payment!.status).toBe("cancelled");
    // Device is free again.
    await expect(chargeCard(ctx, { orderId: o.id, deviceId }, ok())).resolves.toBeTruthy();
  });

  it("keeps the payment pending when the outcome is unknown", async () => {
    const { ctx, game } = await seed("shop-a");
    const deviceId = await withDevice(ctx);
    const o = await createOrder(ctx, { items: [{ productId: game, quantity: 1 }] });
    await expect(chargeCard(ctx, { orderId: o.id, deviceId }, vi.fn(async () => { throw new Error("net"); }) as unknown as typeof fetch)).rejects.toThrow(/Look at the device/);
    const full = await getOrder(ctx, o.id);
    expect(full!.order.status).toBe("awaiting_payment");
    expect(full!.payment!.status).toBe("pending");
  });

  it("allows one waiting payment per device and blocks double sends on an order", async () => {
    const { ctx, game } = await seed("shop-a");
    const deviceId = await withDevice(ctx);
    const o1 = await createOrder(ctx, { items: [{ productId: game, quantity: 1 }] });
    const o2 = await createOrder(ctx, { items: [{ productId: game, quantity: 1 }] });
    await chargeCard(ctx, { orderId: o1.id, deviceId }, ok());
    await expect(chargeCard(ctx, { orderId: o1.id, deviceId }, ok())).rejects.toThrow(/waiting on a device/);
    const busy = ok();
    await expect(chargeCard(ctx, { orderId: o2.id, deviceId }, busy)).rejects.toThrow(/already waiting/);
    expect(busy).not.toHaveBeenCalled();
    expect((await getOrder(ctx, o2.id))!.order.status).toBe("draft");
  });

  it("needs a connected, active device in this business", async () => {
    const a = await seed("shop-a");
    const b = await seed("shop-b");
    const o = await createOrder(a.ctx, { items: [{ productId: a.game, quantity: 1 }] });
    await expect(chargeCard(a.ctx, { orderId: o.id, deviceId: crypto.randomUUID() }, ok())).rejects.toThrow(/not set up/);
    const bDevice = await withDevice(b.ctx);
    await withDevice(a.ctx, "CD34");
    await expect(chargeCard(a.ctx, { orderId: o.id, deviceId: bDevice }, ok())).rejects.toThrow(/not available/);
    expect((await loadHelcimSettings(a.ctx)).devices.length).toBe(1);
  });
});

describe("abandonPayment and cancelOrder", () => {
  it("clears a stuck payment, and a late approval still pays", async () => {
    const { ctx, ws, game } = await seed("shop-a");
    const deviceId = await withDevice(ctx);
    const o = await createOrder(ctx, { items: [{ productId: game, quantity: 1 }] });
    await chargeCard(ctx, { orderId: o.id, deviceId }, ok());
    await abandonPayment(ctx, { orderId: o.id });
    const full = await getOrder(ctx, o.id);
    expect(full!.order.status).toBe("draft");
    expect(full!.payment!.status).toBe("timed_out");
    const r = await resolveCardTransaction(ws.id, { transactionId: "late1", status: "approved", amountCents: 2000, invoiceNumber: "1", deviceCode: "AB12", raw: {} } as never, new Date());
    expect(r).toBe("paid");
    expect((await testDb.select().from(orders).where(eq(orders.id, o.id)))[0]!.status).toBe("paid");
    expect((await testDb.select().from(stockMovements).where(eq(stockMovements.orderId, o.id))).length).toBe(1);
  });

  it("cancels only unpaid drafts", async () => {
    const { ctx, game } = await seed("shop-a");
    const o = await createOrder(ctx, { items: [{ productId: game, quantity: 1 }] });
    await cancelOrder(ctx, { orderId: o.id });
    await expect(cancelOrder(ctx, { orderId: o.id })).rejects.toThrow(/Only an unpaid/);
    await expect(payWithCash(ctx, { orderId: o.id })).rejects.toThrow(/can no longer/);
  });
});

describe("reapStalePayments", () => {
  it("times out old pending payments, frees the device, and a late approval still pays", async () => {
    const { ctx, ws, game } = await seed("shop-a");
    const deviceId = await withDevice(ctx);
    const o = await createOrder(ctx, { items: [{ productId: game, quantity: 1 }] });
    await chargeCard(ctx, { orderId: o.id, deviceId }, ok());
    expect(await reapStalePayments(ws.id, new Date(), 10)).toBe(0);
    expect((await getOrder(ctx, o.id))!.order.status).toBe("awaiting_payment");
    expect(await reapStalePayments(ws.id, new Date(Date.now() + 11 * 60_000), 10)).toBe(1);
    const full = await getOrder(ctx, o.id);
    expect(full!.order.status).toBe("draft");
    expect(full!.payment!.status).toBe("timed_out");
    const o2 = await createOrder(ctx, { items: [{ productId: game, quantity: 1 }] });
    await expect(chargeCard(ctx, { orderId: o2.id, deviceId }, ok())).resolves.toBeTruthy();
    const r = await resolveCardTransaction(ws.id, { transactionId: "late2", status: "approved", amountCents: 2000, invoiceNumber: "1", deviceCode: "AB12", raw: {} } as never, new Date());
    expect(r).toBe("paid");
  });

  it("leaves other businesses alone", async () => {
    const a = await seed("shop-a");
    const b = await seed("shop-b");
    const deviceId = await withDevice(a.ctx);
    const o = await createOrder(a.ctx, { items: [{ productId: a.game, quantity: 1 }] });
    await chargeCard(a.ctx, { orderId: o.id, deviceId }, ok());
    expect(await reapStalePayments(b.ws.id, new Date(Date.now() + 60 * 60_000))).toBe(0);
    expect((await getOrder(a.ctx, o.id))!.order.status).toBe("awaiting_payment");
  });
});

describe("emailReceipt", () => {
  it("emails a paid order, saves the address, and refuses unpaid orders and bad emails", async () => {
    const { ctx, game } = await seed("shop-a", 10);
    const o = await createOrder(ctx, { items: [{ productId: game, quantity: 2 }] });
    await expect(emailReceipt(ctx, { orderId: o.id, email: "ana@x.test" })).rejects.toThrow(/paid order/);
    await payWithCash(ctx, { orderId: o.id });
    await expect(emailReceipt(ctx, { orderId: o.id })).rejects.toThrow(/email address/);
    await expect(emailReceipt(ctx, { orderId: o.id, email: "nope" })).rejects.toThrow(/does not look right/);
    await emailReceipt(ctx, { orderId: o.id, email: "ana@x.test" });
    const call = (sendEmail as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as { to: string; subject: string; text: string };
    expect(call.to).toBe("ana@x.test");
    expect(call.subject).toContain(`order ${o.orderNumber}`);
    expect(call.text).toContain("2 x Game (G1)");
    expect(call.text).toContain("Total paid: $44.00");
    expect((await getOrder(ctx, o.id))!.order.customerEmail).toBe("ana@x.test");
    // Second send reuses the saved address.
    await emailReceipt(ctx, { orderId: o.id });
  });
});

describe("staff orders list", () => {
  it("shows paid online orders and flagged payments under attention, and lets staff finish them", async () => {
    const { ctx, ws, game } = await seed("shop-a");
    const deviceId = await withDevice(ctx);
    // A cash sale: nothing to do.
    const cash = await createOrder(ctx, { items: [{ productId: game, quantity: 1 }] });
    await payWithCash(ctx, { orderId: cash.id });
    expect((await listOrdersForStaff(ctx, "attention")).length).toBe(0);
    // A card sale whose approved amount differs: flagged for review.
    const card = await createOrder(ctx, { items: [{ productId: game, quantity: 1 }] });
    await chargeCard(ctx, { orderId: card.id, deviceId }, ok());
    await resolveCardTransaction(ws.id, { transactionId: "odd1", status: "approved", amountCents: 1, invoiceNumber: String(card.orderNumber), deviceCode: "AB12", raw: {} } as never, new Date());
    const att = await listOrdersForStaff(ctx, "attention");
    expect(att.length).toBe(1);
    expect(att[0]!.payment).toMatchObject({ needsReview: true });
    await expect(resolveReview(ctx, { paymentId: att[0]!.payment!.id, note: "" })).rejects.toThrow();
    await resolveReview(ctx, { paymentId: att[0]!.payment!.id, note: "Checked in Helcim, amount is right" });
    expect((await listOrdersForStaff(ctx, "attention")).length).toBe(0);
    await expect(resolveReview(ctx, { paymentId: att[0]!.payment!.id, note: "again" })).rejects.toThrow(/not waiting/);
    expect((await listOrdersForStaff(ctx, "all")).length).toBe(2);
    expect((await listOrdersForStaff(ctx, "open")).length).toBe(1);
  });

  it("marks paid orders done once, never unpaid ones, and keeps businesses apart", async () => {
    const a = await seed("shop-a");
    const b = await seed("shop-b");
    const o = await createOrder(a.ctx, { items: [{ productId: a.game, quantity: 1 }] });
    await expect(fulfillOrder(a.ctx, { orderId: o.id })).rejects.toThrow(/paid order/);
    await payWithCash(a.ctx, { orderId: o.id });
    await expect(fulfillOrder(b.ctx, { orderId: o.id })).rejects.toThrow(/paid order/);
    await fulfillOrder(a.ctx, { orderId: o.id });
    await expect(fulfillOrder(a.ctx, { orderId: o.id })).rejects.toThrow(/paid order/);
    expect((await listOrdersForStaff(b.ctx, "all")).length).toBe(0);
  });
});
