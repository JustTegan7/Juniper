import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { refundAmounts } from "@evergreen/core";
import { auditLog, helcimConnections, orderItems, orders, payments, refunds, stockMovements } from "@evergreen/db";
import { batch, db } from "../db";
import { auditRow } from "../audit";
import { decryptSecret } from "../helcim/crypto";
import { HelcimError, newIdempotencyKey, refundTransaction } from "../helcim/client";
import { actorOf, requireManager, type Ctx } from "./ctx";

/**
 * Refunds and returns. Managers only. Money and stock move together or not at all:
 * a cash refund settles at once, a card refund only settles when Helcim approves it.
 * An unclear answer from Helcim leaves the refund pending, and stock stays put until it is settled.
 */

type Item = { orderItemId: string; productId: string; quantity: number };

const refundInput = z.object({
  orderId: z.uuid(),
  items: z.array(z.object({ orderItemId: z.uuid(), quantity: z.coerce.number().int().min(1).max(999) })).max(60).default([]),
  /** Put the returned items back on the shelf. */
  restock: z.coerce.boolean().default(true),
  refundShipping: z.coerce.boolean().default(false),
  reason: z.string().trim().min(1, "Say why you are refunding").max(300),
  /** The staff member's IP, passed to Helcim. */
  ipAddress: z.string().trim().max(60).optional(),
});

/** What is left to refund on an order, from refunds that are approved or still pending. */
async function priorRefunds(orderId: string) {
  const rows = await db().select().from(refunds).where(and(eq(refunds.orderId, orderId), inArray(refunds.status, ["approved", "pending"])));
  const returned = new Map<string, number>();
  let amount = 0;
  let tax = 0;
  let shipping = 0;
  for (const r of rows) {
    amount += r.amountCents;
    tax += r.taxCents;
    shipping += r.shippingCents;
    for (const i of r.items as Item[]) returned.set(i.orderItemId, (returned.get(i.orderItemId) ?? 0) + i.quantity);
  }
  return { rows, returned, amount, tax, shipping };
}

export async function refundOrder(ctx: Ctx, raw: unknown, fetchImpl: typeof fetch = fetch) {
  requireManager(ctx);
  const v = refundInput.parse(raw);
  const d = db();
  const ws = ctx.workspace.id;
  const [order] = await d.select().from(orders).where(and(eq(orders.id, v.orderId), eq(orders.workspaceId, ws)));
  if (!order) throw new Error("That order was not found.");
  if (order.status !== "paid" && order.status !== "fulfilled") throw new Error("Only a paid order can be refunded.");
  const [pay] = await d.select().from(payments).where(and(eq(payments.orderId, order.id), eq(payments.status, "approved")));
  if (!pay) throw new Error("This order has no approved payment to refund.");
  const isCash = (pay.raw as { tender?: string } | null)?.tender === "cash";

  const all = await d.select().from(orderItems).where(and(eq(orderItems.orderId, order.id), eq(orderItems.workspaceId, ws)));
  const prior = await priorRefunds(order.id);
  if (prior.rows.some((r) => r.status === "pending")) throw new Error("A card refund on this order is still waiting for an answer. Check Helcim, then retry or clear it first.");

  // Merge repeated lines, then check each against what is left.
  const asked = new Map<string, number>();
  for (const i of v.items) asked.set(i.orderItemId, (asked.get(i.orderItemId) ?? 0) + i.quantity);
  const lines: (Item & { unitPriceCents: number })[] = [];
  for (const [orderItemId, quantity] of asked) {
    const it = all.find((a) => a.id === orderItemId);
    if (!it) throw new Error("One of those items is not on this order.");
    const left = it.quantity - (prior.returned.get(it.id) ?? 0);
    if (quantity > left) throw new Error(`${it.name}: only ${left} left to refund.`);
    lines.push({ orderItemId, productId: it.productId, quantity, unitPriceCents: it.unitPriceCents });
  }
  if (!lines.length && !v.refundShipping) throw new Error("Choose what to refund.");
  if (v.refundShipping && order.shippingCents - prior.shipping <= 0) throw new Error("Shipping was already refunded or this order had none.");

  const finishesItems = all.every((it) => (prior.returned.get(it.id) ?? 0) + (asked.get(it.id) ?? 0) === it.quantity);
  const amt = refundAmounts(order, lines, prior, finishesItems && lines.length > 0, v.refundShipping);
  if (amt.totalCents <= 0) throw new Error("The refund total must be more than zero.");
  if (prior.amount + amt.totalCents > order.totalCents) throw new Error("That is more than the customer paid.");

  const idempotencyKey = isCash ? `cashrefund:${newIdempotencyKey()}` : newIdempotencyKey();
  const itemsJson: Item[] = lines.map((l) => ({ orderItemId: l.orderItemId, productId: l.productId, quantity: l.quantity }));
  const [row] = await d
    .insert(refunds)
    .values({
      workspaceId: ws, orderId: order.id, paymentId: pay.id, method: isCash ? "cash" : "card", status: "pending",
      amountCents: amt.totalCents, taxCents: amt.taxCents, shippingCents: amt.shippingCents, items: itemsJson,
      restock: v.restock, reason: v.reason, idempotencyKey, createdByUserId: ctx.userId,
    })
    .returning();
  const refund = row!;

  if (isCash) {
    await settle(ctx, refund, order.id, order.totalCents, null);
    return { message: `Refund of $${(amt.totalCents / 100).toFixed(2)} recorded. Give the customer cash.`, id: refund.id };
  }
  return sendCardRefund(ctx, refund, pay.helcimTransactionId, v.ipAddress, fetchImpl);
}

async function sendCardRefund(ctx: Ctx, refund: typeof refunds.$inferSelect, originalTxn: string | null, ipAddress: string | undefined, fetchImpl: typeof fetch) {
  const d = db();
  const fail = async (message: string, raw?: unknown) => {
    await d.update(refunds).set({ status: "failed", resolvedAt: new Date(), raw: raw ?? null }).where(and(eq(refunds.id, refund.id), eq(refunds.status, "pending")));
    await d.insert(auditLog).values(auditRow(actorOf(ctx), "refund", refund.id, "failed", undefined, { message }));
    throw new Error(message);
  };
  if (!originalTxn) return fail("This payment has no Helcim transaction on file. Refund it in Helcim, then record it as handled.");
  const [conn] = await d.select().from(helcimConnections).where(eq(helcimConnections.workspaceId, ctx.workspace.id)).limit(1);
  if (!conn) return fail("Helcim is not connected, so the card cannot be refunded here.");

  try {
    const res = await refundTransaction(
      { apiToken: decryptSecret(conn.apiTokenEnc), partnerToken: process.env.HELCIM_PARTNER_TOKEN || undefined },
      { originalTransactionId: originalTxn, amountCents: refund.amountCents, idempotencyKey: refund.idempotencyKey, ipAddress: ipAddress || "127.0.0.1" },
      fetchImpl,
    );
    if (res.status === "approved") {
      const [o] = await d.select({ totalCents: orders.totalCents }).from(orders).where(eq(orders.id, refund.orderId));
      await settle(ctx, refund, refund.orderId, o!.totalCents, res.transactionId, res.raw);
      return { message: `Refunded $${(refund.amountCents / 100).toFixed(2)} to the card.`, id: refund.id };
    }
    if (res.status === "declined") return fail("Helcim declined the refund. Nothing was changed.", res.raw);
    await d.update(refunds).set({ raw: res.raw }).where(eq(refunds.id, refund.id));
    throw new Error("Helcim did not say the refund went through. Check Helcim, then retry it here or clear it.");
  } catch (e) {
    if (e instanceof HelcimError) {
      if (e.status >= 400 && e.status < 500) return fail(`${e.message}. Nothing was changed.`);
      await d.insert(auditLog).values(auditRow(actorOf(ctx), "refund", refund.id, "send_unconfirmed", undefined, { status: e.status }));
      throw new Error("Could not confirm the refund with Helcim. Check Helcim before trying again. Retrying here is safe and cannot refund twice.");
    }
    throw e;
  }
}

/** Marks a refund approved and moves stock and order status in one batch. */
async function settle(ctx: Ctx, refund: typeof refunds.$inferSelect, orderId: string, orderTotal: number, txnId: string | null, raw?: unknown) {
  const d = db();
  const now = new Date();
  const items = refund.items as Item[];
  const after = await priorRefunds(orderId);
  // The refund being settled is still pending, so it is already in this total.
  const fully = after.amount >= orderTotal;
  await batch([
    d.update(refunds).set({ status: "approved", resolvedAt: now, helcimTransactionId: txnId, raw: raw ?? null }).where(and(eq(refunds.id, refund.id), eq(refunds.status, "pending"))),
    ...(refund.restock && items.length
      ? [d.insert(stockMovements).values(items.map((i) => ({ workspaceId: refund.workspaceId, productId: i.productId, delta: i.quantity, reason: "return" as const, orderId, note: "Refund return", createdByUserId: ctx.userId })))]
      : []),
    ...(fully
      ? [d.update(orders).set({ status: "refunded" }).where(eq(orders.id, orderId)), ...(refund.paymentId ? [d.update(payments).set({ status: "refunded" }).where(eq(payments.id, refund.paymentId))] : [])]
      : []),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "refund", refund.id, "approved", undefined, { orderId, amountCents: refund.amountCents, method: refund.method, restock: refund.restock })),
  ]);
}

/** Tries a pending card refund again with the same key, so Helcim cannot refund it twice. */
export async function retryRefund(ctx: Ctx, raw: unknown, fetchImpl: typeof fetch = fetch) {
  requireManager(ctx);
  const { refundId, ipAddress } = z.object({ refundId: z.uuid(), ipAddress: z.string().max(60).optional() }).parse(raw);
  const d = db();
  const [refund] = await d.select().from(refunds).where(and(eq(refunds.id, refundId), eq(refunds.workspaceId, ctx.workspace.id), eq(refunds.status, "pending")));
  if (!refund) throw new Error("That refund is not waiting.");
  if (refund.method !== "card") throw new Error("Only card refunds can be retried.");
  const [pay] = refund.paymentId ? await d.select().from(payments).where(eq(payments.id, refund.paymentId)) : [];
  return sendCardRefund(ctx, refund, pay?.helcimTransactionId ?? null, ipAddress, fetchImpl);
}

/**
 * The manager refunded it in Helcim by hand (or confirmed it never went through). Approve records it and moves stock;
 * clear drops it so the items can be refunded again.
 */
export async function resolvePendingRefund(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const v = z.object({ refundId: z.uuid(), outcome: z.enum(["approved", "cleared"]), note: z.string().trim().min(1, "Say what you checked").max(300) }).parse(raw);
  const d = db();
  const [refund] = await d.select().from(refunds).where(and(eq(refunds.id, v.refundId), eq(refunds.workspaceId, ctx.workspace.id), eq(refunds.status, "pending")));
  if (!refund) throw new Error("That refund is not waiting.");
  if (v.outcome === "cleared") {
    await batch([
      d.update(refunds).set({ status: "failed", resolvedAt: new Date() }).where(eq(refunds.id, refund.id)),
      d.insert(auditLog).values(auditRow(actorOf(ctx), "refund", refund.id, "cleared", undefined, { note: v.note })),
    ]);
    return { message: "Cleared. Nothing was refunded." };
  }
  const [o] = await d.select({ totalCents: orders.totalCents }).from(orders).where(eq(orders.id, refund.orderId));
  await settle(ctx, refund, refund.orderId, o!.totalCents, null, { manual: v.note });
  return { message: "Recorded as refunded." };
}

/** Approved and pending refunds for orders, for the staff order list. */
export async function listRefunds(workspaceId: string, orderIds: string[]) {
  if (!orderIds.length) return [];
  return db().select().from(refunds).where(and(eq(refunds.workspaceId, workspaceId), inArray(refunds.orderId, orderIds), inArray(refunds.status, ["approved", "pending"])));
}
