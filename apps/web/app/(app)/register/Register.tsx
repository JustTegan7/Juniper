"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { abandonPaymentAction, cancelOrderAction, chargeCardAction, createOrderAction, orderStatusAction, payWithCashAction } from "../actions";
import { useResultToast } from "../../../components/app/useAct";

type P = { id: string; sku: string; name: string; priceCents: number; onHand: number };
type Device = { id: string; label: string; kind: "smart_terminal" | "card_reader" };
type Recent = { id: string; orderNumber: number; status: string; totalCents: number };
type Phase = "building" | "waiting" | "paid";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export function Register({ products, devices, taxRatePercent, recent }: { products: P[]; devices: Device[]; taxRatePercent: number; recent: Recent[] }) {
  const router = useRouter();
  const show = useResultToast();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("building");
  const [busy, setBusy] = useState(false);
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");
  const [note, setNote] = useState<string | null>(null);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const lines = Object.entries(cart).map(([id, qty]) => ({ p: byId.get(id)!, qty })).filter((l) => l.p);
  const subtotal = lines.reduce((n, l) => n + l.p.priceCents * l.qty, 0);
  const tax = Math.round((subtotal * taxRatePercent) / 100);
  const total = subtotal + tax;
  const locked = orderId !== null;
  const shown = products.filter((p) => !q.trim() || `${p.name} ${p.sku}`.toLowerCase().includes(q.trim().toLowerCase()));

  function setQty(id: string, qty: number) {
    if (locked) return;
    const p = byId.get(id);
    if (!p) return;
    const n = Math.max(0, Math.min(qty, p.onHand));
    setCart((c) => {
      const next = { ...c };
      if (n === 0) delete next[id];
      else next[id] = n;
      return next;
    });
  }

  async function ensureOrder(): Promise<string | null> {
    if (orderId) return orderId;
    const r = await createOrderAction({ items: lines.map((l) => ({ productId: l.p.id, quantity: l.qty })) });
    if (!r.ok) {
      show(r);
      return null;
    }
    setOrderId(r.id ?? null);
    return r.id ?? null;
  }

  const syncFromServer = useCallback(async (id: string, wasWaiting: boolean) => {
    const s = await orderStatusAction(id);
    if (!s) return;
    if (s.status === "paid" || s.status === "fulfilled") {
      setPhase("paid");
      setNote(null);
    } else if (s.status === "awaiting_payment") setPhase("waiting");
    else if (wasWaiting) {
      setPhase("building");
      setNote(s.paymentStatus === "declined" ? "The card was declined. You can try again or take cash." : s.paymentStatus === "cancelled" ? "The customer cancelled on the device." : "The payment request ended without a payment.");
    }
  }, []);

  async function payCash() {
    setBusy(true);
    const id = await ensureOrder();
    if (id) {
      const r = await payWithCashAction({ orderId: id });
      show(r);
      if (r.ok) setPhase("paid");
      else await syncFromServer(id, false);
    }
    setBusy(false);
  }

  async function payCard() {
    setBusy(true);
    setNote(null);
    const id = await ensureOrder();
    if (id) {
      const r = await chargeCardAction({ orderId: id, deviceId });
      show(r);
      if (r.ok) setPhase("waiting");
      else await syncFromServer(id, false);
    }
    setBusy(false);
  }

  // While a card payment is waiting, ask the server every 2 seconds. The webhook is what actually settles it.
  useEffect(() => {
    if (phase !== "waiting" || !orderId) return;
    const t = setInterval(() => void syncFromServer(orderId, true), 2000);
    return () => clearInterval(t);
  }, [phase, orderId, syncFromServer]);

  async function clearRequest() {
    if (!orderId) return;
    setBusy(true);
    const r = await abandonPaymentAction({ orderId });
    show(r);
    if (r.ok) {
      setPhase("building");
      setNote("Request cleared. Check the device before charging again.");
    }
    setBusy(false);
  }

  async function changeCart() {
    if (!orderId) return;
    setBusy(true);
    const r = await cancelOrderAction({ orderId });
    show(r);
    if (r.ok) setOrderId(null);
    setBusy(false);
  }

  function newSale() {
    setCart({});
    setOrderId(null);
    setPhase("building");
    setNote(null);
    router.refresh();
  }

  if (phase === "paid") {
    return (
      <div className="card space-y-4 p-6 text-center">
        <p className="text-2xl font-bold">Paid</p>
        <p className="text-muted">Stock has been updated.</p>
        <button className="btn btn-primary" onClick={newSale}>New sale</button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        <input className="input" placeholder="Search products or SKU" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
        {products.length === 0 && <p className="card p-4 text-muted">No products yet. A manager can add them under Products.</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((p) => {
            const inCart = cart[p.id] ?? 0;
            const out = p.onHand <= 0;
            return (
              <li key={p.id}>
                <button type="button" disabled={locked || out || inCart >= p.onHand} onClick={() => setQty(p.id, inCart + 1)} className="card flex w-full items-center justify-between gap-3 p-3 text-left disabled:opacity-50">
                  <span>
                    <span className="block font-semibold">{p.name}</span>
                    <span className="block text-xs text-muted">{p.sku} · {out ? "Out of stock" : `${p.onHand} in stock`}</span>
                  </span>
                  <span className="font-semibold">{money(p.priceCents)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="card h-fit space-y-3 p-4" aria-label="Current sale">
        <h2 className="font-bold">Current sale</h2>
        {lines.length === 0 && <p className="text-sm text-muted">Tap a product to add it.</p>}
        <ul className="divide-y divide-line">
          {lines.map(({ p, qty }) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="flex items-center gap-1">
                <button type="button" className="btn btn-soft btn-sm" disabled={locked} onClick={() => setQty(p.id, qty - 1)} aria-label={`Remove one ${p.name}`}>-</button>
                <span className="w-6 text-center">{qty}</span>
                <button type="button" className="btn btn-soft btn-sm" disabled={locked || qty >= p.onHand} onClick={() => setQty(p.id, qty + 1)} aria-label={`Add one ${p.name}`}>+</button>
              </span>
              <span className="w-16 text-right">{money(p.priceCents * qty)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div>
          {taxRatePercent > 0 && <div className="flex justify-between"><dt>Tax ({taxRatePercent}%)</dt><dd>{money(tax)}</dd></div>}
          <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{money(total)}</dd></div>
        </dl>

        {note && <p role="status" className="rounded-md bg-surface-2 p-2 text-sm">{note}</p>}

        {phase === "waiting" ? (
          <div className="space-y-2">
            <p role="status" className="rounded-md bg-surface-2 p-2 text-sm font-semibold">Waiting for the customer to pay on the device.</p>
            <button className="btn btn-soft w-full" disabled={busy} onClick={clearRequest}>Clear request</button>
          </div>
        ) : (
          <div className="space-y-2">
            {devices.length > 0 && (
              <label className="block">
                <span className="label">Card device</span>
                <select className="input" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                  {devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </label>
            )}
            <button className="btn btn-primary w-full" disabled={busy || lines.length === 0 || total <= 0 || devices.length === 0} onClick={payCard}>Charge card {total > 0 ? money(total) : ""}</button>
            {devices.length === 0 && <p className="text-xs text-muted">No card device yet. An owner adds one in Settings.</p>}
            <button className="btn btn-soft w-full" disabled={busy || lines.length === 0} onClick={payCash}>Paid in cash</button>
            {locked && <button className="btn btn-ghost btn-sm w-full" disabled={busy} onClick={changeCart}>Change the cart</button>}
          </div>
        )}
      </aside>

      {recent.length > 0 && (
        <section className="lg:col-span-2" aria-label="Recent orders">
          <h2 className="mb-2 font-bold">Recent orders</h2>
          <ul className="card divide-y divide-line text-sm">
            {recent.map((o) => (
              <li key={o.id} className="flex justify-between px-4 py-2"><span>Order {o.orderNumber}</span><span className="text-muted">{o.status.replace("_", " ")} · {money(o.totalCents)}</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
