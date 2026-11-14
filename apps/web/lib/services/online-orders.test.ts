import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { memberships, orders, payments, user, workspaces } from "@evergreen/db";
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
const { saveProduct, onHandFor, adjustStock } = await import("./products");
const { saveHelcimConnection } = await import("./helcim-connection");
const { helcimJson } = await import("../helcim/client");
const { confirmOnlinePayment, expireOnlineOrders, loadShop, startOnlineCheckout } = await import("./online-orders");
type Ctx = import("./ctx").Ctx;

async function seed(slug: string, opts: { online?: boolean; connect?: boolean } = {}) {
  const ws = await createBusiness({ name: `Shop ${slug}`, slug });
  await testDb.update(workspaces).set({ settings: parseSettings({ shop: { enabled: true, onlineEnabled: opts.online ?? true, taxRatePercent: 10, shippingFlatCents: 500 } }) }).where(eq(workspaces.id, ws.id));
  const uid = `u-${slug}`;
  await testDb.insert(user).values({ id: uid, name: "T", email: `${uid}@x.test` });
  const [m] = await testDb.insert(memberships).values({ workspaceId: ws.id, userId: uid, role: "owner" }).returning();
  const ctx = { userId: uid, name: "T", email: `${uid}@x.test`, role: "owner", membershipId: m!.id, workspace: { id: ws.id, settings: parseSettings({}) } } as unknown as Ctx;
  if (opts.connect ?? true) await saveHelcimConnection(ctx, { apiToken: "api-token-12345" });
  const game = await saveProduct(ctx, { sku: "G1", name: "Game", price: "20.00", startingStock: 3 });
  const pickup = await saveProduct(ctx, { sku: "P1", name: "Big shelf", price: "100.00", startingStock: 1, shippingAllowed: false });
  return { ctx, ws, game: game.id, pickup: pickup.id };
}

let n = 0;
/** A fake Helcim that hands out tokens and remembers the secret so tests can sign results. */
function fakeHelcim() {
  const secrets = new Map<string, string>();
  const f = vi.fn(async () => {
    const checkoutToken = `checkout${String(++n).padStart(8, "0")}`;
    const secretToken = `secret${n}`;
    secrets.set(checkoutToken, secretToken);
    return new Response(JSON.stringify({ checkoutToken, secretToken }), { status: 200 });
  }) as unknown as typeof fetch;
  const sign = (checkoutToken: string, data: Record<string, unknown>, escSlash = false) => ({
    hash: createHash("sha256").update(helcimJson(data, escSlash) + secrets.get(checkoutToken)!).digest("hex"),
    data,
  });
  return { f, sign };
}

const cart = (productId: string, quantity = 1) => ({ items: [{ productId, quantity }], fulfillment: "pickup" as const, customerName: "Ana", customerEmail: "ana@x.test" });
const approved = (amount: string, extra: Record<string, unknown> = {}) => ({ transactionId: "9001", status: "APPROVED", amount, ...extra });

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url)) });
});
beforeEach(async () => {
  await pg.exec('TRUNCATE workspaces, "user" CASCADE');
});

describe("loadShop", () => {
  it("is closed unless the shop, online selling and Helcim are all on", async () => {
    await seed("shop-a", { online: false });
    await seed("shop-b", { connect: false });
    await seed("shop-c");
    expect(await loadShop("shop-a")).toBeNull();
    expect(await loadShop("shop-b")).toBeNull();
    expect(await loadShop("nope")).toBeNull();
    expect((await loadShop("shop-c"))!.products.map((p) => p.sku)).toEqual(["P1", "G1"]);
  });

  it("holds stock for a started checkout, and frees it after 15 minutes", async () => {
    const a = await seed("shop-a");
    const { f } = fakeHelcim();
    await startOnlineCheckout("shop-a", cart(a.game, 2), f);
    expect((await loadShop("shop-a"))!.products.find((p) => p.sku === "G1")!.available).toBe(1);
    expect((await loadShop("shop-a", new Date(Date.now() + 16 * 60_000)))!.products.find((p) => p.sku === "G1")!.available).toBe(3);
  });
});

describe("startOnlineCheckout", () => {
  it("prices on the server with tax and flat shipping", async () => {
    const a = await seed("shop-a");
    const { f } = fakeHelcim();
    const r = await startOnlineCheckout("shop-a", { ...cart(a.game, 2), fulfillment: "ship", shipTo: { name: "Ana", line1: "1 Main", city: "Everett", state: "WA", zip: "98201" } }, f);
    expect(r.totalCents).toBe(4000 + 400 + 500);
    const body = JSON.parse(((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ amount: 49, invoiceNumber: String(r.orderNumber) });
  });

  it("rejects bad carts and fulfillment", async () => {
    const a = await seed("shop-a");
    const { f } = fakeHelcim();
    await expect(startOnlineCheckout("shop-a", cart(a.game, 4), f)).rejects.toThrow(/only 3 available/);
    await expect(startOnlineCheckout("shop-a", { ...cart(a.pickup), fulfillment: "ship", shipTo: { name: "A", line1: "1", city: "c", state: "WA", zip: "98201" } }, f)).rejects.toThrow(/pickup only/);
    await expect(startOnlineCheckout("shop-a", { ...cart(a.game), fulfillment: "ship" }, f)).rejects.toThrow(/shipping address/);
    await expect(startOnlineCheckout("shop-a", { ...cart(a.game), customerEmail: "nope" }, f)).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });

  it("cancels the order if Helcim cannot start a session", async () => {
    const a = await seed("shop-a");
    await expect(startOnlineCheckout("shop-a", cart(a.game), vi.fn(async () => new Response("no", { status: 500 })) as unknown as typeof fetch)).rejects.toThrow(/not available/);
    expect((await testDb.select().from(orders).where(eq(orders.workspaceId, a.ws.id)))[0]!.status).toBe("cancelled");
    expect((await loadShop("shop-a"))!.products.find((p) => p.sku === "G1")!.available).toBe(3);
  });
});

describe("confirmOnlinePayment", () => {
  it("marks paid and takes stock out once, even if confirmed twice", async () => {
    const a = await seed("shop-a");
    const { f, sign } = fakeHelcim();
    const s = await startOnlineCheckout("shop-a", cart(a.game, 2), f);
    const response = sign(s.checkoutToken, approved("44.00", { cardHolderName: "José Núñez", note: "a/b" }));
    expect(await confirmOnlinePayment("shop-a", { checkoutToken: s.checkoutToken, response })).toEqual({ ok: true, orderNumber: s.orderNumber });
    expect(await confirmOnlinePayment("shop-a", { checkoutToken: s.checkoutToken, response })).toEqual({ ok: true, orderNumber: s.orderNumber });
    expect((await testDb.select().from(orders).where(eq(orders.workspaceId, a.ws.id)))[0]).toMatchObject({ status: "paid" });
    expect((await onHandFor(a.ws.id, [a.game]))[a.game]).toBe(1);
    const calls = (sendEmail as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const mine = calls.filter((c) => (c[0] as { to: string }).to === "ana@x.test");
    expect(mine.length).toBe(1);
    expect((mine[0]![0] as { text: string }).text).toContain("This order is for pickup");
  });

  it("accepts the result wrapped in a status envelope", async () => {
    const a = await seed("shop-a");
    const { f, sign } = fakeHelcim();
    const s = await startOnlineCheckout("shop-a", cart(a.game), f);
    const r = await confirmOnlinePayment("shop-a", { checkoutToken: s.checkoutToken, response: { status: 200, data: sign(s.checkoutToken, approved("22.00")) } });
    expect(r.ok).toBe(true);
  });

  it("accepts the slash-escaped hash variant", async () => {
    const a = await seed("shop-a");
    const { f, sign } = fakeHelcim();
    const s = await startOnlineCheckout("shop-a", cart(a.game), f);
    const r = await confirmOnlinePayment("shop-a", { checkoutToken: s.checkoutToken, response: sign(s.checkoutToken, approved("22.00", { note: "a/b" }), true) });
    expect(r.ok).toBe(true);
  });

  it("rejects a tampered result and flags it for review without paying", async () => {
    const a = await seed("shop-a");
    const { f, sign } = fakeHelcim();
    const s = await startOnlineCheckout("shop-a", cart(a.game), f);
    const good = sign(s.checkoutToken, approved("22.00"));
    const bad = { hash: good.hash, data: { ...good.data, amount: "0.01" } };
    const r = await confirmOnlinePayment("shop-a", { checkoutToken: s.checkoutToken, response: bad });
    expect(r.ok).toBe(false);
    const [p] = await testDb.select().from(payments).where(eq(payments.workspaceId, a.ws.id));
    expect(p).toMatchObject({ status: "pending", needsReview: true });
    expect((await onHandFor(a.ws.id, [a.game]))[a.game]).toBe(3);
  });

  it("rejects a properly signed result for the wrong amount, a decline, and an unknown token", async () => {
    const a = await seed("shop-a");
    const { f, sign } = fakeHelcim();
    const s = await startOnlineCheckout("shop-a", cart(a.game), f);
    expect((await confirmOnlinePayment("shop-a", { checkoutToken: s.checkoutToken, response: sign(s.checkoutToken, approved("1.00")) })).ok).toBe(false);
    expect((await confirmOnlinePayment("shop-a", { checkoutToken: s.checkoutToken, response: sign(s.checkoutToken, { transactionId: "1", status: "DECLINED", amount: "22.00" }) })).ok).toBe(false);
    expect((await confirmOnlinePayment("shop-a", { checkoutToken: "doesnotexist1", response: {} })).ok).toBe(false);
    expect((await onHandFor(a.ws.id, [a.game]))[a.game]).toBe(3);
  });

  it("cannot be confirmed through another business", async () => {
    const a = await seed("shop-a");
    await seed("shop-b");
    const { f, sign } = fakeHelcim();
    const s = await startOnlineCheckout("shop-a", cart(a.game), f);
    expect((await confirmOnlinePayment("shop-b", { checkoutToken: s.checkoutToken, response: sign(s.checkoutToken, approved("22.00")) })).ok).toBe(false);
  });

  it("takes the money but flags the order when the item sold out first", async () => {
    const a = await seed("shop-a");
    const { f, sign } = fakeHelcim();
    const s = await startOnlineCheckout("shop-a", cart(a.pickup), f);
    await adjustStock(a.ctx, { kind: "adjust", productId: a.pickup, quantity: -1, note: "Sold in store" });
    expect((await confirmOnlinePayment("shop-a", { checkoutToken: s.checkoutToken, response: sign(s.checkoutToken, approved("110.00")) })).ok).toBe(true);
    const [p] = await testDb.select().from(payments).where(eq(payments.workspaceId, a.ws.id));
    expect(p).toMatchObject({ status: "approved", needsReview: true });
  });
});

describe("expireOnlineOrders", () => {
  it("cancels unpaid online orders after an hour", async () => {
    const a = await seed("shop-a");
    const { f } = fakeHelcim();
    await startOnlineCheckout("shop-a", cart(a.game), f);
    expect(await expireOnlineOrders(a.ws.id, new Date())).toBe(0);
    expect(await expireOnlineOrders(a.ws.id, new Date(Date.now() + 61 * 60_000))).toBe(1);
  });
});
