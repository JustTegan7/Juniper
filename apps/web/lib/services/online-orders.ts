import "server-only";
import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLog, helcimConnections, orderCounters, orderItems, orders, payments, products, stockMovements } from "@evergreen/db";
import { batch, db } from "../db";
import { auditRow, type AuditActor } from "../audit";
import { decryptSecret, encryptSecret } from "../helcim/crypto";
import { HelcimError, initializeHelcimPay, verifyPayHash } from "../helcim/client";
import { loadBusinessBySlug } from "./public";
import { onHandFor } from "./products";
import { sendOrderReceipt, taxFor } from "./orders";

// The public online shop. Nothing here trusts the browser except the slug, the cart and what the customer typed.
// Prices, tax, shipping and stock come from the database. Payment is only believed after the HelcimPay.js hash checks out.

const HOLD_MINUTES = 15;
const EXPIRE_MINUTES = 60; // Helcim checkout tokens last 60 minutes
const MAX_OPEN_PER_WINDOW = 25;

const system = (workspaceId: string): AuditActor => ({ workspaceId, userId: null, label: "Online shop" });

export interface ShopProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  priceCents: number;
  images: string[];
  available: number;
  shippingAllowed: boolean;
  pickupAllowed: boolean;
}

/** Units customers are in the middle of buying: items on online orders still awaiting payment, started in the last 15 minutes. */
async function heldUnits(workspaceId: string, now: Date): Promise<Map<string, number>> {
  const since = new Date(now.getTime() - HOLD_MINUTES * 60_000);
  const rows = await db()
    .select({ productId: orderItems.productId, qty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.workspaceId, workspaceId), eq(orders.channel, "online"), eq(orders.status, "awaiting_payment"), gt(orders.createdAt, since)))
    .groupBy(orderItems.productId);
  return new Map(rows.map((r) => [r.productId, Number(r.qty)]));
}

/** Online orders nobody finished paying for are cancelled after an hour, when the checkout token has expired anyway. */
export async function expireOnlineOrders(workspaceId: string, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - EXPIRE_MINUTES * 60_000);
  const gone = await db()
    .update(orders)
    .set({ status: "cancelled" })
    .where(and(eq(orders.workspaceId, workspaceId), eq(orders.channel, "online"), eq(orders.status, "awaiting_payment"), lt(orders.createdAt, cutoff)))
    .returning({ id: orders.id });
  if (gone.length) await db().update(payments).set({ status: "timed_out", resolvedAt: now }).where(and(inArray(payments.orderId, gone.map((g) => g.id)), eq(payments.status, "pending")));
  return gone.length;
}

export async function loadShop(slug: string, now = new Date()) {
  const ws = await loadBusinessBySlug(slug);
  const shop = ws?.settings.shop;
  if (!ws || !shop?.enabled || !shop.onlineEnabled) return null;
  const [conn] = await db().select({ id: helcimConnections.id }).from(helcimConnections).where(eq(helcimConnections.workspaceId, ws.id)).limit(1);
  if (!conn) return null;
  await expireOnlineOrders(ws.id, now);
  const rows = await db().select().from(products).where(and(eq(products.workspaceId, ws.id), eq(products.active, true), isNull(products.deletedAt)));
  const [onHand, held] = await Promise.all([onHandFor(ws.id, rows.map((r) => r.id)), heldUnits(ws.id, now)]);
  const items: ShopProduct[] = rows
    .map((p) => ({ id: p.id, sku: p.sku, name: p.name, description: p.description, priceCents: p.priceCents, images: (p.images as string[] | null) ?? [], available: Math.max(0, (onHand[p.id] ?? 0) - (held.get(p.id) ?? 0)), shippingAllowed: p.shippingAllowed, pickupAllowed: p.pickupAllowed }))
    .filter((p) => p.available > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { business: { name: ws.name, slug: ws.slug, brandColor: ws.brandColor }, products: items, taxRatePercent: shop.taxRatePercent, shippingFlatCents: shop.shippingFlatCents };
}

const address = z.object({
  name: z.string().trim().min(1, "Add the name for the package").max(120),
  line1: z.string().trim().min(1, "Add a street address").max(160),
  line2: z.string().trim().max(160).optional().transform((v) => v || null),
  city: z.string().trim().min(1, "Add a city").max(80),
  state: z.string().trim().min(2, "Add a state").max(40),
  zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "Use a 5 digit ZIP code"),
});

const checkoutInput = z.object({
  items: z.array(z.object({ productId: z.uuid(), quantity: z.coerce.number().int().min(1).max(99) })).min(1, "Your cart is empty").max(40),
  fulfillment: z.enum(["pickup", "ship"]),
  customerName: z.string().trim().min(1, "Add your name").max(120),
  customerEmail: z.email("Add a valid email").max(200),
  shipTo: address.optional(),
});

/** Creates the order and the Helcim checkout session. Returns only what the browser needs. */
export async function startOnlineCheckout(slug: string, raw: unknown, fetchImpl: typeof fetch = fetch, now = new Date()) {
  const input = checkoutInput.parse(raw);
  const shop = await loadShop(slug, now);
  if (!shop) throw new Error("This shop is not open.");
  const ws = (await loadBusinessBySlug(slug))!;
  if (input.fulfillment === "ship" && !input.shipTo) throw new Error("Add a shipping address.");

  const d = db();
  const since = new Date(now.getTime() - HOLD_MINUTES * 60_000);
  const [{ n }] = await d.select({ n: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.workspaceId, ws.id), eq(orders.channel, "online"), eq(orders.status, "awaiting_payment"), gt(orders.createdAt, since)));
  if (Number(n) >= MAX_OPEN_PER_WINDOW) throw new Error("The shop is busy. Try again in a few minutes.");

  const merged = new Map<string, number>();
  for (const l of input.items) merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.quantity);
  const byId = new Map(shop.products.map((p) => [p.id, p]));
  for (const [productId, qty] of merged) {
    const p = byId.get(productId);
    if (!p) throw new Error("An item in your cart is no longer available.");
    if (qty > p.available) throw new Error(`${p.name}: only ${p.available} available.`);
    if (input.fulfillment === "ship" && !p.shippingAllowed) throw new Error(`${p.name} is pickup only.`);
    if (input.fulfillment === "pickup" && !p.pickupAllowed) throw new Error(`${p.name} is shipping only.`);
  }

  const subtotal = [...merged].reduce((n2, [id, q]) => n2 + byId.get(id)!.priceCents * q, 0);
  const tax = taxFor(subtotal, shop.taxRatePercent);
  const shipping = input.fulfillment === "ship" ? shop.shippingFlatCents : 0;
  const total = subtotal + tax + shipping;
  if (total <= 0) throw new Error("The total must be more than zero.");

  const [conn] = await d.select().from(helcimConnections).where(eq(helcimConnections.workspaceId, ws.id)).limit(1);
  if (!conn) throw new Error("This shop is not open.");

  const [counter] = await d.insert(orderCounters).values({ workspaceId: ws.id, next: 2 }).onConflictDoUpdate({ target: orderCounters.workspaceId, set: { next: sql`${orderCounters.next} + 1` } }).returning({ next: orderCounters.next });
  const orderNumber = counter!.next - 1;
  const [order] = await d
    .insert(orders)
    .values({ workspaceId: ws.id, orderNumber, channel: "online", status: "awaiting_payment", fulfillment: input.fulfillment, subtotalCents: subtotal, taxCents: tax, shippingCents: shipping, totalCents: total, customerName: input.customerName, customerEmail: input.customerEmail, shipTo: input.fulfillment === "ship" ? input.shipTo : null })
    .returning({ id: orders.id });
  await d.insert(orderItems).values([...merged].map(([id, quantity]) => ({ workspaceId: ws.id, orderId: order!.id, productId: id, sku: byId.get(id)!.sku, name: byId.get(id)!.name, unitPriceCents: byId.get(id)!.priceCents, quantity })));

  let session: { checkoutToken: string; secretToken: string };
  try {
    session = await initializeHelcimPay({ apiToken: decryptSecret(conn.apiTokenEnc), partnerToken: process.env.HELCIM_PARTNER_TOKEN || undefined }, { amountCents: total, currency: conn.currency, invoiceNumber: String(orderNumber) }, fetchImpl);
  } catch (e) {
    await d.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order!.id));
    throw e instanceof HelcimError ? new Error(e.message) : e;
  }
  await batch([
    d.insert(payments).values({ workspaceId: ws.id, orderId: order!.id, channel: "online", status: "pending", amountCents: total, idempotencyKey: `online:${session.checkoutToken}`, raw: { secretTokenEnc: encryptSecret(session.secretToken) } }),
    d.insert(auditLog).values(auditRow(system(ws.id), "order", order!.id, "online_checkout_started", undefined, { orderNumber, totalCents: total, fulfillment: input.fulfillment })),
  ]);
  return { checkoutToken: session.checkoutToken, orderNumber, totalCents: total };
}

export type ConfirmResult = { ok: true; orderNumber: number } | { ok: false; message: string };

const responseShape = z.object({ hash: z.string(), data: z.record(z.string(), z.unknown()) });

function centsFrom(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+(\.\d{1,4})?$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * The browser says the payment went through. We only believe it if the hash matches our secret token,
 * the amount matches the order, and Helcim says approved. Anything else is flagged, never silently paid.
 */
export async function confirmOnlinePayment(slug: string, raw: unknown, now = new Date()): Promise<ConfirmResult> {
  const input = z.object({ checkoutToken: z.string().min(8).max(200), response: z.unknown() }).safeParse(raw);
  if (!input.success) return { ok: false, message: "We could not read the payment result." };
  const ws = await loadBusinessBySlug(slug);
  if (!ws) return { ok: false, message: "This shop is not open." };
  const d = db();
  const [payment] = await d.select().from(payments).where(and(eq(payments.workspaceId, ws.id), eq(payments.idempotencyKey, `online:${input.data.checkoutToken}`), eq(payments.channel, "online")));
  if (!payment) return { ok: false, message: "We could not find that payment." };
  const [order] = await d.select().from(orders).where(and(eq(orders.id, payment.orderId), eq(orders.workspaceId, ws.id)));
  if (!order) return { ok: false, message: "We could not find that order." };
  if (payment.status === "approved") return { ok: true, orderNumber: order.orderNumber };

  const flag = async (why: string) => {
    await batch([
      d.update(payments).set({ needsReview: true, raw: { ...(payment.raw as object), reviewReason: why } }).where(eq(payments.id, payment.id)),
      d.insert(auditLog).values(auditRow(system(ws.id), "payment", payment.id, `needs_review: ${why}`, undefined, { orderNumber: order.orderNumber })),
    ]);
    return { ok: false as const, message: "We could not confirm your payment. If your card was charged, contact the shop with your order number." };
  };

  // Helcim's docs show the result both as { hash, data } and wrapped as { status, data: { hash, data } }. Accept either.
  const r0 = input.data.response as { data?: { hash?: unknown; data?: unknown } } | null;
  const unwrapped = r0 && typeof r0 === "object" && r0.data && typeof r0.data === "object" && "hash" in r0.data && "data" in r0.data ? r0.data : input.data.response;
  const shape = responseShape.safeParse(unwrapped);
  const secretEnc = (payment.raw as { secretTokenEnc?: string } | null)?.secretTokenEnc;
  if (!shape.success || !secretEnc) return flag("unreadable result");
  if (!verifyPayHash(shape.data, decryptSecret(secretEnc))) return flag("hash did not match");
  const data = shape.data.data;
  const transactionId = typeof data.transactionId === "string" || typeof data.transactionId === "number" ? String(data.transactionId) : null;
  if (!transactionId) return flag("no transaction id");
  const status = String(data.status ?? "");
  if (!/^approv/i.test(status)) return { ok: false, message: "The card was not approved. Nothing was charged." };
  if (centsFrom(data.amount) !== payment.amountCents) return flag(`amount ${String(data.amount)} does not match ${payment.amountCents}`);

  const items = await d.select().from(orderItems).where(and(eq(orderItems.orderId, order.id), eq(orderItems.workspaceId, ws.id)));
  const onHand = await onHandFor(ws.id, items.map((i) => i.productId));
  const oversold = items.some((i) => (onHand[i.productId] ?? 0) < i.quantity);
  const claimed = await d
    .update(payments)
    .set({ status: "approved", helcimTransactionId: transactionId, resolvedAt: now, needsReview: oversold, raw: { ...(payment.raw as object), result: data, ...(oversold ? { reviewReason: "sold out before payment landed, refund may be needed" } : {}) } })
    .where(and(eq(payments.id, payment.id), inArray(payments.status, ["pending", "timed_out"])))
    .returning({ id: payments.id });
  if (!claimed.length) return { ok: true, orderNumber: order.orderNumber };
  await batch([
    d.update(orders).set({ status: "paid", paidAt: now }).where(and(eq(orders.id, order.id), inArray(orders.status, ["awaiting_payment", "cancelled"]))),
    d.insert(stockMovements).values(items.map((i) => ({ workspaceId: ws.id, productId: i.productId, delta: -i.quantity, reason: "online_sale" as const, orderId: order.id, note: "Online order paid" }))).onConflictDoNothing(),
    d.insert(auditLog).values(auditRow(system(ws.id), "payment", payment.id, oversold ? "approved_oversold" : "approved", { status: "pending" }, { status: "approved", orderId: order.id })),
  ]);
  // Best effort. A failed email never undoes a paid order.
  await sendOrderReceipt(ws.id, order.id, { name: ws.name, timezone: ws.timezone, phone: ws.settings.contact.phone, address: ws.settings.contact.address }).catch((e) => console.error("Receipt failed", e));
  return { ok: true, orderNumber: order.orderNumber };
}
