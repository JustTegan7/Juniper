"use client";

import { useRouter } from "next/navigation";
import { emailReceiptAction, fulfillOrderAction, resolveReviewAction } from "../actions";
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

      <div className="flex flex-wrap gap-2">
        {o.status === "paid" && (
          <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => act(() => fulfillOrderAction({ orderId: o.id }), done)}>
            {o.fulfillment === "ship" ? "Mark shipped" : o.fulfillment === "pickup" ? "Mark picked up" : "Mark done"}
          </button>
        )}
        {(o.status === "paid" || o.status === "fulfilled") && o.customerEmail && (
          <button className="btn btn-soft btn-sm" disabled={pending} onClick={() => act(() => emailReceiptAction({ orderId: o.id }))}>Resend receipt</button>
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
    </li>
  );
}
