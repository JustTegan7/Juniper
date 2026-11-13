import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auditLog, helcimDevices, orderItems, orders, payments, stockMovements } from "@evergreen/db";
import { batch, db } from "../db";
import { auditRow } from "../audit";
import type { CardTransaction } from "../helcim/client";

// Settles card payments from Helcim. System actor: there is no signed-in person, so every change is audited as "Helcim".
// Money safety rules:
//  - Stock only comes out when a payment is approved and everything about it agrees (amount, order still open).
//  - Anything odd flags needsReview and changes nothing else. A person decides.
//  - Every step is safe to run twice, so a retried webhook finishes a half done run instead of repeating it.

export type ResolveResult = "paid" | "already_paid" | "declined" | "cancelled" | "needs_review" | "no_match" | "ignored";

type Payment = typeof payments.$inferSelect;

const actor = (workspaceId: string) => ({ workspaceId, userId: null, label: "Helcim" });

export interface PaymentHint {
  invoiceNumber: string | null;
  deviceCode: string | null;
  amountCents: number | null;
}

/** Matches by our order number first (we send it as the Helcim invoiceNumber). Falls back to device, amount and pending. */
export async function findPayment(workspaceId: string, hint: PaymentHint): Promise<{ payment: Payment; viaFallback: boolean } | null> {
  const d = db();
  const n = hint.invoiceNumber && /^\d{1,9}$/.test(hint.invoiceNumber) ? Number(hint.invoiceNumber) : null;
  if (n !== null) {
    const [row] = await d
      .select({ payment: payments })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(and(eq(payments.workspaceId, workspaceId), eq(orders.workspaceId, workspaceId), eq(orders.orderNumber, n), eq(payments.channel, "in_person")))
      .orderBy(desc(payments.requestedAt))
      .limit(1);
    if (row) return { payment: row.payment, viaFallback: false };
  }
  if (hint.deviceCode && hint.amountCents !== null) {
    const rows = await d
      .select({ payment: payments })
      .from(payments)
      .innerJoin(helcimDevices, eq(helcimDevices.id, payments.deviceId))
      .where(and(eq(payments.workspaceId, workspaceId), eq(payments.status, "pending"), eq(payments.amountCents, hint.amountCents), eq(helcimDevices.code, hint.deviceCode)))
      .limit(2);
    if (rows.length === 1) return { payment: rows[0]!.payment, viaFallback: true };
  }
  return null;
}

async function flagForReview(payment: Payment, reason: string, raw: unknown, now: Date) {
  await batch([
    db().update(payments).set({ needsReview: true, raw: raw as object }).where(eq(payments.id, payment.id)),
    db().insert(auditLog).values(auditRow(actor(payment.workspaceId), "payment", payment.id, `needs_review: ${reason}`, undefined, { at: now.toISOString() })),
  ]);
}

async function completeApprovedOrder(payment: Payment, now: Date, audit: boolean) {
  const d = db();
  const items = await d.select().from(orderItems).where(and(eq(orderItems.orderId, payment.orderId), eq(orderItems.workspaceId, payment.workspaceId)));
  const reason = payment.channel === "online" ? ("online_sale" as const) : ("sale" as const);
  await batch([
    d
      .update(orders)
      .set({ status: "paid", paidAt: now })
      .where(and(eq(orders.id, payment.orderId), inArray(orders.status, ["draft", "awaiting_payment"]))),
    ...(items.length
      ? [
          d
            .insert(stockMovements)
            .values(items.map((i) => ({ workspaceId: payment.workspaceId, productId: i.productId, delta: -i.quantity, reason, orderId: payment.orderId, note: "Card payment approved" })))
            .onConflictDoNothing(),
        ]
      : []),
    ...(audit ? [d.insert(auditLog).values(auditRow(actor(payment.workspaceId), "payment", payment.id, "approved", { status: "pending" }, { status: "approved", orderId: payment.orderId }))] : []),
  ]);
}

/** Settles a payment from a Helcim card transaction record (fetched by id, never taken from the webhook body). */
export async function resolveCardTransaction(workspaceId: string, txn: CardTransaction, now: Date): Promise<ResolveResult> {
  const found = await findPayment(workspaceId, { invoiceNumber: txn.invoiceNumber, deviceCode: txn.deviceCode, amountCents: txn.amountCents });
  if (!found) return "no_match";
  const { payment, viaFallback } = found;
  const d = db();

  if (txn.status === "other") return "ignored";

  if (txn.status === "declined") {
    const claimed = await d
      .update(payments)
      .set({ status: "declined", helcimTransactionId: txn.transactionId, resolvedAt: now, raw: txn.raw as object })
      .where(and(eq(payments.id, payment.id), inArray(payments.status, ["pending", "timed_out"])))
      .returning({ id: payments.id });
    if (!claimed.length) return "ignored";
    // Back to draft so the employee can charge again on the same order.
    await d.update(orders).set({ status: "draft" }).where(and(eq(orders.id, payment.orderId), eq(orders.status, "awaiting_payment")));
    return "declined";
  }

  // Approved from here.
  if (txn.amountCents !== null && txn.amountCents !== payment.amountCents) {
    await flagForReview(payment, `approved amount ${txn.amountCents} differs from ${payment.amountCents}`, txn.raw, now);
    return "needs_review";
  }

  const [order] = await d.select().from(orders).where(and(eq(orders.id, payment.orderId), eq(orders.workspaceId, workspaceId))).limit(1);
  if (!order || !["draft", "awaiting_payment", "paid"].includes(order.status)) {
    await flagForReview(payment, "approved payment for an order that is no longer open", txn.raw, now);
    return "needs_review";
  }

  const replay = payment.status === "approved" && payment.helcimTransactionId === txn.transactionId;
  if (!replay && !["pending", "timed_out"].includes(payment.status)) {
    await flagForReview(payment, `approved transaction for a ${payment.status} payment`, txn.raw, now);
    return "needs_review";
  }

  let claimedNow = false;
  if (!replay) {
    const claimed = await d
      .update(payments)
      .set({ status: "approved", helcimTransactionId: txn.transactionId, resolvedAt: now, raw: txn.raw as object, needsReview: viaFallback || payment.needsReview })
      .where(and(eq(payments.id, payment.id), inArray(payments.status, ["pending", "timed_out"])))
      .returning({ id: payments.id });
    claimedNow = claimed.length > 0;
    if (!claimedNow) return "ignored";
  }

  // Safe to run again after a crash: the order update is conditional and the stock rows are unique per order and product.
  await completeApprovedOrder(payment, now, claimedNow);
  return replay ? "already_paid" : "paid";
}

export interface TerminalCancelPayload {
  invoiceNumber?: string | null;
  deviceCode?: string | null;
  transactionAmount?: number | null;
}

/** The customer cancelled on the device before it processed. Frees the device and reopens the order. */
export async function resolveTerminalCancel(workspaceId: string, p: TerminalCancelPayload, now: Date): Promise<ResolveResult> {
  const found = await findPayment(workspaceId, {
    invoiceNumber: p.invoiceNumber ?? null,
    deviceCode: p.deviceCode ?? null,
    amountCents: typeof p.transactionAmount === "number" ? Math.round(p.transactionAmount * 100) : null,
  });
  if (!found) return "no_match";
  const d = db();
  const claimed = await d
    .update(payments)
    .set({ status: "cancelled", resolvedAt: now })
    .where(and(eq(payments.id, found.payment.id), eq(payments.status, "pending")))
    .returning({ id: payments.id });
  if (!claimed.length) return "ignored";
  await d.update(orders).set({ status: "draft" }).where(and(eq(orders.id, found.payment.orderId), eq(orders.status, "awaiting_payment")));
  return "cancelled";
}
