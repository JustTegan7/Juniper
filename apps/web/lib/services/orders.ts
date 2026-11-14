import "server-only";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLog, helcimConnections, helcimDevices, orderCounters, orderItems, orders, payments, products, stockMovements } from "@evergreen/db";
import { batch, db } from "../db";
import { auditRow } from "../audit";
import { decryptSecret } from "../helcim/crypto";
import { HelcimError, newIdempotencyKey, startPurchase } from "../helcim/client";
import { actorOf, type Ctx } from "./ctx";
import { onHandFor } from "./products";

/** Register work is open to the whole team. Orders and payments are always scoped to the business in ctx. */

const lineInput = z.object({ productId: z.uuid(), quantity: z.coerce.number().int().min(1).max(999) });
const createInput = z.object({
  items: z.array(lineInput).min(1, "Add at least one product").max(60),
  customerName: z.string().trim().max(120).optional().transform((v) => v || null),
  customerEmail: z.string().trim().max(200).optional().transform((v) => v || null),
});

export function taxFor(subtotalCents: number, ratePercent: number): number {
  return Math.round((subtotalCents * ratePercent) / 100);
}

/** Same product twice in one cart becomes one line. */
function mergeLines(lines: z.infer<typeof lineInput>[]) {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity);
  return [...m].map(([productId, quantity]) => ({ productId, quantity }));
}

async function assertInStock(workspaceId: string, items: { productId: string; quantity: number; name: string }[]) {
  const onHand = await onHandFor(workspaceId, items.map((i) => i.productId));
  for (const i of items) {
    if ((onHand[i.productId] ?? 0) < i.quantity) throw new Error(`${i.name}: only ${onHand[i.productId] ?? 0} in stock.`);
  }
}

/** Starts an in-person order as a draft. Prices come from the product, never from the browser. */
export async function createOrder(ctx: Ctx, raw: unknown) {
  const input = createInput.parse(raw);
  const lines = mergeLines(input.items);
  const d = db();
  const ws = ctx.workspace.id;
  const found = await d
    .select()
    .from(products)
    .where(and(eq(products.workspaceId, ws), inArray(products.id, lines.map((l) => l.productId)), isNull(products.deletedAt), eq(products.active, true)));
  const byId = new Map(found.map((p) => [p.id, p]));
  for (const l of lines) if (!byId.has(l.productId)) throw new Error("A product in the cart is no longer for sale.");
  await assertInStock(ws, lines.map((l) => ({ ...l, name: byId.get(l.productId)!.name })));

  const subtotal = lines.reduce((n, l) => n + byId.get(l.productId)!.priceCents * l.quantity, 0);
  const tax = taxFor(subtotal, ctx.workspace.settings.shop.taxRatePercent);
  const [counter] = await d
    .insert(orderCounters)
    .values({ workspaceId: ws, next: 2 })
    .onConflictDoUpdate({ target: orderCounters.workspaceId, set: { next: sql`${orderCounters.next} + 1` } })
    .returning({ next: orderCounters.next });
  const orderNumber = counter!.next - 1;
  const [order] = await d
    .insert(orders)
    .values({
      workspaceId: ws,
      orderNumber,
      channel: "in_person",
      status: "draft",
      fulfillment: "counter",
      subtotalCents: subtotal,
      taxCents: tax,
      totalCents: subtotal + tax,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      createdByMembershipId: ctx.membershipId,
    })
    .returning({ id: orders.id });
  await batch([
    d.insert(orderItems).values(lines.map((l) => ({ workspaceId: ws, orderId: order!.id, productId: l.productId, sku: byId.get(l.productId)!.sku, name: byId.get(l.productId)!.name, unitPriceCents: byId.get(l.productId)!.priceCents, quantity: l.quantity }))),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "order", order!.id, "created", undefined, { orderNumber, totalCents: subtotal + tax })),
  ]);
  return { message: `Order ${orderNumber} started.`, id: order!.id, orderNumber, totalCents: subtotal + tax };
}

const orderRef = z.object({ orderId: z.uuid() });

async function loadDraft(ctx: Ctx, orderId: string) {
  const d = db();
  const [order] = await d.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.workspaceId, ctx.workspace.id), eq(orders.channel, "in_person")));
  if (!order) throw new Error("That order was not found.");
  if (order.status === "paid" || order.status === "fulfilled") throw new Error("That order is already paid.");
  if (order.status === "awaiting_payment") throw new Error("A card payment is waiting on a device. Finish or cancel it first.");
  if (order.status !== "draft") throw new Error("That order can no longer be charged.");
  const items = await d.select().from(orderItems).where(and(eq(orderItems.orderId, order.id), eq(orderItems.workspaceId, ctx.workspace.id)));
  await assertInStock(ctx.workspace.id, items);
  return { order, items };
}

/** Cash sale. Records the order, the tender and the stock in one step. A second tap fails on the unique key and changes nothing. */
export async function payWithCash(ctx: Ctx, raw: unknown) {
  const { orderId } = orderRef.parse(raw);
  const { order, items } = await loadDraft(ctx, orderId);
  const d = db();
  const now = new Date();
  await batch([
    d.update(orders).set({ status: "paid", paidAt: now }).where(and(eq(orders.id, order.id), eq(orders.status, "draft"))),
    d.insert(payments).values({ workspaceId: order.workspaceId, orderId: order.id, channel: "in_person", status: "approved", amountCents: order.totalCents, idempotencyKey: `cash:${order.id}`, resolvedAt: now, raw: { tender: "cash" } }),
    d.insert(stockMovements).values(items.map((i) => ({ workspaceId: order.workspaceId, productId: i.productId, delta: -i.quantity, reason: "sale" as const, orderId: order.id, note: "Cash sale", createdByUserId: ctx.userId }))).onConflictDoNothing(),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "order", order.id, "paid_cash", { status: "draft" }, { status: "paid", totalCents: order.totalCents })),
  ]);
  return { message: `Order ${order.orderNumber} paid in cash.`, id: order.id };
}

const chargeInput = orderRef.extend({ deviceId: z.uuid() });

/**
 * Sends the order total to a card device. Stock only comes out when the payment webhook confirms.
 * Returns once Helcim has accepted the request. The result arrives by webhook.
 */
export async function chargeCard(ctx: Ctx, raw: unknown, fetchImpl: typeof fetch = fetch) {
  const { orderId, deviceId } = chargeInput.parse(raw);
  const { order } = await loadDraft(ctx, orderId);
  const d = db();
  const ws = ctx.workspace.id;
  const [conn] = await d.select().from(helcimConnections).where(eq(helcimConnections.workspaceId, ws)).limit(1);
  if (!conn) throw new Error("Card payments are not set up yet. An owner can connect Helcim in Settings.");
  const [device] = await d.select().from(helcimDevices).where(and(eq(helcimDevices.id, deviceId), eq(helcimDevices.workspaceId, ws), eq(helcimDevices.connectionId, conn.id)));
  if (!device || !device.active) throw new Error("That device is not available.");
  if (order.totalCents <= 0) throw new Error("The total must be more than zero to charge a card.");

  const idempotencyKey = newIdempotencyKey();
  // The one-pending-payment-per-device index is the lock. If it trips, the device is busy.
  let paymentId: string;
  try {
    const [p] = await d
      .insert(payments)
      .values({ workspaceId: ws, orderId: order.id, channel: "in_person", status: "pending", amountCents: order.totalCents, deviceId: device.id, idempotencyKey })
      .returning({ id: payments.id });
    paymentId = p!.id;
  } catch {
    throw new Error(`${device.label} is already waiting on a payment. Finish or cancel it first.`);
  }
  const claimed = await d.update(orders).set({ status: "awaiting_payment" }).where(and(eq(orders.id, order.id), eq(orders.status, "draft"))).returning({ id: orders.id });
  if (!claimed.length) {
    await d.update(payments).set({ status: "cancelled", resolvedAt: new Date() }).where(eq(payments.id, paymentId));
    throw new Error("That order changed. Reload and try again.");
  }

  try {
    await startPurchase(
      { apiToken: decryptSecret(conn.apiTokenEnc), partnerToken: process.env.HELCIM_PARTNER_TOKEN || undefined },
      { deviceCode: device.code, amountCents: order.totalCents, currency: conn.currency, invoiceNumber: String(order.orderNumber), idempotencyKey },
      fetchImpl,
    );
  } catch (e) {
    if (e instanceof HelcimError && e.notSent) {
      // Nothing reached the device. Free it and reopen the order.
      await batch([
        d.update(payments).set({ status: "cancelled", resolvedAt: new Date() }).where(and(eq(payments.id, paymentId), eq(payments.status, "pending"))),
        d.update(orders).set({ status: "draft" }).where(and(eq(orders.id, order.id), eq(orders.status, "awaiting_payment"))),
      ]);
      throw new Error(e.message);
    }
    // Unknown. The request may have reached the device, so the payment stays pending and the webhook or the cancel button settles it.
    await d.insert(auditLog).values(auditRow(actorOf(ctx), "payment", paymentId, "send_unconfirmed", undefined, { orderId: order.id }));
    throw new Error("Could not confirm the request reached the device. Look at the device before trying again. If a payment shows up it will be recorded.");
  }
  await d.insert(auditLog).values(auditRow(actorOf(ctx), "payment", paymentId, "sent_to_device", undefined, { orderId: order.id, device: device.code, amountCents: order.totalCents }));
  return { message: `Sent ${order.orderNumber} to ${device.label}. Waiting for the customer.`, id: order.id };
}

/**
 * The customer walked away or the device is stuck. Frees the device and reopens the order.
 * The payment is marked timed out, not cancelled: if the customer still pays, the webhook will settle it.
 */
export async function abandonPayment(ctx: Ctx, raw: unknown) {
  const { orderId } = orderRef.parse(raw);
  const d = db();
  const [order] = await d.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.workspaceId, ctx.workspace.id)));
  if (!order) throw new Error("That order was not found.");
  if (order.status !== "awaiting_payment") throw new Error("There is no card payment waiting on this order.");
  const now = new Date();
  await batch([
    d.update(payments).set({ status: "timed_out", resolvedAt: now }).where(and(eq(payments.orderId, order.id), eq(payments.status, "pending"))),
    d.update(orders).set({ status: "draft" }).where(and(eq(orders.id, order.id), eq(orders.status, "awaiting_payment"))),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "order", order.id, "payment_abandoned", { status: "awaiting_payment" }, { status: "draft" })),
  ]);
  return { message: "Payment request cleared. Check the device before charging again." };
}

/** Only an order nobody has paid or started paying can be cancelled. */
export async function cancelOrder(ctx: Ctx, raw: unknown) {
  const { orderId } = orderRef.parse(raw);
  const d = db();
  const r = await d.update(orders).set({ status: "cancelled" }).where(and(eq(orders.id, orderId), eq(orders.workspaceId, ctx.workspace.id), eq(orders.status, "draft"))).returning({ id: orders.id });
  if (!r.length) throw new Error("Only an unpaid order with no card payment waiting can be cancelled.");
  await d.insert(auditLog).values(auditRow(actorOf(ctx), "order", orderId, "cancelled", { status: "draft" }, { status: "cancelled" }));
  return { message: "Order cancelled." };
}

/** One order with its lines and latest payment. The register polls this while a card payment is waiting. */
export async function getOrder(ctx: Ctx, orderId: string) {
  const d = db();
  const ws = ctx.workspace.id;
  const [order] = await d.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.workspaceId, ws)));
  if (!order) return null;
  const items = await d.select().from(orderItems).where(and(eq(orderItems.orderId, order.id), eq(orderItems.workspaceId, ws))).orderBy(asc(orderItems.name));
  const [payment] = await d.select().from(payments).where(and(eq(payments.orderId, order.id), eq(payments.workspaceId, ws))).orderBy(desc(payments.requestedAt)).limit(1);
  return { order, items, payment: payment ?? null };
}

export async function listRecentOrders(ctx: Ctx, limit = 25) {
  return db().select().from(orders).where(and(eq(orders.workspaceId, ctx.workspace.id), eq(orders.channel, "in_person"))).orderBy(desc(orders.createdAt)).limit(limit);
}

/**
 * Settles card payments that have waited too long for any answer (device off, customer left, webhook lost).
 * They become timed_out, which still accepts a late approval from Helcim, and the order reopens so the device is free.
 * Runs whenever the register loads or polls, so it needs no cron job.
 */
export async function reapStalePayments(workspaceId: string, now = new Date(), maxAgeMinutes = 10): Promise<number> {
  const d = db();
  const cutoff = new Date(now.getTime() - maxAgeMinutes * 60_000);
  const stale = await d
    .update(payments)
    .set({ status: "timed_out", resolvedAt: now })
    .where(and(eq(payments.workspaceId, workspaceId), eq(payments.status, "pending"), eq(payments.channel, "in_person"), lt(payments.requestedAt, cutoff)))
    .returning({ orderId: payments.orderId, id: payments.id });
  if (!stale.length) return 0;
  await d.update(orders).set({ status: "draft" }).where(and(eq(orders.workspaceId, workspaceId), inArray(orders.id, stale.map((x) => x.orderId)), eq(orders.status, "awaiting_payment")));
  await d.insert(auditLog).values(stale.map((x) => auditRow({ workspaceId, userId: null, label: "System" }, "payment", x.id, "timed_out", { status: "pending" }, { status: "timed_out" })));
  return stale.length;
}
