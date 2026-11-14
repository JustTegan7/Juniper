"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { emailReceiptAction, fulfillOrderAction, refundOrderAction, resolvePendingRefundAction, resolveReviewAction, retryRefundAction } from "../actions";
import { Dialog } from "../../../components/app/Dialog";
import { useAct } from "../../../components/app/useAct";

type Row = {
  id: string;
  orderNumber: number;
  channel: "in_person" | "online";
  status: string;
  fulfillment: "counter" | "pickup" | "ship";
  totalCents: number;
  customerName: string | null;
  customerEmail: string | null;
  shipTo: Record<string, string | null> | null;
  createdAt: string;
  items: { id: string; name: string; sku: string; quantity: number; unitPriceCents: number }[];
  shippingCents: number;
  refunds: { id: string; status: string; method: string; amountCents: number; shippingCents: number; reason: string; items: { orderItemId: string; quantity: number }[] }[];
  payment: { id: string; status: string; needsReview: boolean; reviewReason: string | null; tender: string | null } | null;
};

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const STATUS: Record<string, string> = { draft: "Not paid", awaiting_payment: "Waiting for payment", paid: "Paid", fulfilled: "Done", cancelled: "Cancelled", refunded: "Refunded" };

export function OrderList({ orders, canResolve }: { orders: Row[]; canResolve: boolean }) {
  if (!orders.length) return <p className="card p-4 text-muted">Nothing here.</p>;
  return (
    <ul className="space-y-3">
      {orders.map((o) => <OrderCard key={o.id} o={o} canResolve={canResolve} />)}
    </ul>
  );
}

function OrderCard({ o, canResolve }: { o: Row; canResolve: boolean }) {
  const router = useRouter();
  const { act, pending } = useAct();
  const done = () => router.refresh();
  const flagged = o.payment?.needsReview;
  const [refunding, setRefunding] = useState(false);
  const refunded = o.refunds.filter((r) => r.status === "approved").reduce((n, r) => n + r.amountCents, 0);
  const waiting = o.refunds.filter((r) => r.status === "pending");
  const a = o.shipTo;
  return (
    <li className={`card space-y-3 p-4 ${flagged ? "border-red-400" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-bold">Order {o.orderNumber}</span>
          <span className="ml-2 text-sm text-muted">{o.channel === "online" ? "Online" : "Register"} · {STATUS[o.status] ?? o.status} · {money(o.totalCents)}</span>
        </div>
        <span className="text-xs text-muted">{new Date(o.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
      </div>

      {flagged && (
        <p role="alert" className="rounded-md bg-surface-2 p-2 text-sm font-semibold">
          Needs a look: {o.payment?.reviewReason ?? "this payment did not match cleanly"}. Check the payment in Helcim, refund it there if needed, then mark it handled.
        </p>
      )}

      <ul className="text-sm">
        {o.items.map((i) => <li key={i.id}>{i.quantity} x {i.name} <span className="text-muted">({i.sku})</span> · {money(i.unitPriceCents * i.quantity)}</li>)}
      </ul>

      {(o.customerName || o.customerEmail) && <p className="text-sm">{[o.customerName, o.customerEmail].filter(Boolean).join(" · ")}</p>}
      {o.fulfillment === "ship" && a && <p className="whitespace-pre-line text-sm">Ship to: {[a.name, a.line1, a.line2, `${a.city ?? ""}, ${a.state ?? ""} ${a.zip ?? ""}`].filter(Boolean).join("\n")}</p>}
      {o.fulfillment === "pickup" && <p className="text-sm">Pickup</p>}
      {o.payment?.tender && <p className="text-xs text-muted">Paid by {o.payment.tender}</p>}
      {refunded > 0 && <p className="text-sm font-semibold">Refunded so far: {money(refunded)}</p>}
      {waiting.map((r) => (
        <div key={r.id} role="alert" className="space-y-2 rounded-md bg-surface-2 p-2 text-sm">
          <p className="font-semibold">A {money(r.amountCents)} card refund has no answer from Helcim yet. Check Helcim first.</p>
          {canResolve && (
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-soft btn-sm" disabled={pending} onClick={() => act(() => retryRefundAction({ refundId: r.id }), done)}>Retry (safe, cannot refund twice)</button>
              <button className="btn btn-soft btn-sm" disabled={pending} onClick={() => { const note = prompt("Refunded in Helcim by hand? What did you check?"); if (note?.trim()) act(() => resolvePendingRefundAction({ refundId: r.id, outcome: "approved", note }), done); }}>It was refunded</button>
              <button className="btn btn-soft btn-sm" disabled={pending} onClick={() => { const note = prompt("Helcim shows no refund? What did you check?"); if (note?.trim()) act(() => resolvePendingRefundAction({ refundId: r.id, outcome: "cleared", note }), done); }}>It was not refunded</button>
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        {o.status === "paid" && (
          <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => act(() => fulfillOrderAction({ orderId: o.id }), done)}>
            {o.fulfillment === "ship" ? "Mark shipped" : o.fulfillment === "pickup" ? "Mark picked up" : "Mark done"}
          </button>
        )}
        {(o.status === "paid" || o.status === "fulfilled") && o.customerEmail && (
          <button className="btn btn-soft btn-sm" disabled={pending} onClick={() => act(() => emailReceiptAction({ orderId: o.id }))}>Resend receipt</button>
        )}
        {canResolve && (o.status === "paid" || o.status === "fulfilled") && waiting.length === 0 && (
          <button className="btn btn-soft btn-sm" onClick={() => setRefunding(true)}>Refund or return</button>
        )}
        {flagged && canResolve && o.payment && (
          <button
            className="btn btn-soft btn-sm"
            disabled={pending}
            onClick={() => {
              const note = prompt("What did you do? For example: refunded in Helcim, or checked and the amount is right.");
              if (note?.trim()) act(() => resolveReviewAction({ paymentId: o.payment!.id, note }), done);
            }}
          >
            Mark handled
          </button>
        )}
      </div>
      <RefundDialog o={o} open={refunding} onClose={() => setRefunding(false)} onDone={done} />
    </li>
  );
}

function RefundDialog({ o, open, onClose, onDone }: { o: Row; open: boolean; onClose: () => void; onDone: () => void }) {
  const { act, pending } = useAct();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState(true);
  const [shipping, setShipping] = useState(false);
  const [reason, setReason] = useState("");
  const approved = o.refunds.filter((r) => r.status === "approved");
  const left = (id: string, sold: number) => sold - approved.reduce((n, r) => n + (r.items.find((i) => i.orderItemId === id)?.quantity ?? 0), 0);
  const shippingLeft = o.shippingCents - approved.reduce((n, r) => n + r.shippingCents, 0);
  const items = Object.entries(qty).filter(([, n]) => n > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
  const card = o.payment?.tender !== "cash";
  return (
    <Dialog open={open} onClose={onClose} title={`Refund order ${o.orderNumber}`}>
      {open && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => refundOrderAction({ orderId: o.id, items, restock, refundShipping: shipping, reason }), () => { setQty({}); setReason(""); onClose(); onDone(); });
          }}
        >
          <p className="text-sm text-muted">Pick what is coming back. Sales tax on those items is refunded too. {card ? "The money goes back to the customer's card through Helcim." : "This was a cash sale, so give the customer cash from the drawer."}</p>
          <ul className="space-y-2">
            {o.items.map((i) => {
              const max = left(i.id, i.quantity);
              return (
                <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>{i.name} <span className="text-muted">({money(i.unitPriceCents)} each, {max} left)</span></span>
                  <input type="number" min={0} max={max} disabled={max === 0} className="input w-20 py-1" aria-label={`Quantity of ${i.name} to refund`} value={qty[i.id] ?? 0} onChange={(e) => setQty({ ...qty, [i.id]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) })} />
                </li>
              );
            })}
          </ul>
          {shippingLeft > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shipping} onChange={(e) => setShipping(e.target.checked)} />Also refund shipping ({money(shippingLeft)})</label>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />Put the items back in stock</label>
          <label className="block"><span className="label">Why</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required placeholder="For example: disc would not read" /></label>
          <button className="btn btn-primary" disabled={pending || (items.length === 0 && !shipping) || !reason.trim()}>Refund</button>
        </form>
      )}
    </Dialog>
  );
}
