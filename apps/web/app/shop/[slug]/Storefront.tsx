"use client";

import { useEffect, useRef, useState } from "react";
import { confirmPaymentAction, startCheckoutAction } from "./actions";

type Product = { id: string; sku: string; name: string; description: string | null; priceCents: number; images: string[]; available: number; shippingAllowed: boolean; pickupAllowed: boolean };
type Shop = { business: { name: string; slug: string; brandColor: string }; products: Product[]; taxRatePercent: number; shippingFlatCents: number };

declare global {
  interface Window {
    appendHelcimPayIframe?: (token: string, allowExit?: boolean) => void;
    removeHelcimPayIframe?: () => void;
  }
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const SCRIPT = "https://secure.helcim.app/helcim-pay/services/start.js";

function loadHelcimScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.appendHelcimPayIframe) return resolve();
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment form. Check your connection and try again."));
    document.head.appendChild(s);
  });
}

export function Storefront({ slug, shop }: { slug: string; shop: Shop }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [step, setStep] = useState<"shop" | "details" | "paying" | "done">("shop");
  const [fulfillment, setFulfillment] = useState<"pickup" | "ship">("pickup");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const tokenRef = useRef<string | null>(null);
  const byId = new Map(shop.products.map((p) => [p.id, p]));

  const lines = Object.entries(cart).map(([id, qty]) => ({ p: byId.get(id)!, qty })).filter((l) => l.p);
  const canShip = lines.length > 0 && lines.every((l) => l.p.shippingAllowed);
  const canPickup = lines.length > 0 && lines.every((l) => l.p.pickupAllowed);
  const mode = fulfillment === "ship" && canShip ? "ship" : canPickup ? "pickup" : "ship";
  const subtotal = lines.reduce((n, l) => n + l.p.priceCents * l.qty, 0);
  const tax = Math.round((subtotal * shop.taxRatePercent) / 100);
  const shipping = mode === "ship" ? shop.shippingFlatCents : 0;
  const total = subtotal + tax + shipping;

  function setQty(id: string, qty: number) {
    const p = byId.get(id);
    if (!p) return;
    const n = Math.max(0, Math.min(qty, p.available));
    setCart((c) => {
      const next = { ...c };
      if (n === 0) delete next[id];
      else next[id] = n;
      return next;
    });
  }

  // Listen for HelcimPay.js results. Nothing here is trusted: the server checks the hash and amount.
  useEffect(() => {
    if (step !== "paying") return;
    async function onMessage(event: MessageEvent) {
      const token = tokenRef.current;
      if (!token || event.data?.eventName !== `helcim-pay-js-${token}`) return;
      if (event.data.eventStatus === "HIDE") {
        // Closed before paying, or closed the confirmation after paying. The success branch already moved on.
        window.removeHelcimPayIframe?.();
        setStep((s) => (s === "paying" ? "details" : s));
        return;
      }
      if (event.data.eventStatus === "ABORTED") {
        window.removeHelcimPayIframe?.();
        setError("The card was not approved. Nothing was charged. You can try again.");
        setStep("details");
        return;
      }
      if (event.data.eventStatus === "SUCCESS") {
        let response: unknown = null;
        try {
          response = typeof event.data.eventMessage === "string" ? JSON.parse(event.data.eventMessage) : event.data.eventMessage;
        } catch {
          response = null;
        }
        const r = await confirmPaymentAction(slug, { checkoutToken: token, response });
        window.removeHelcimPayIframe?.();
        if (r.ok) {
          setOrderNumber(r.orderNumber);
          setCart({});
          setStep("done");
        } else {
          setError(r.message);
          setStep("details");
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [step, slug]);

  async function pay(form: FormData) {
    setError(null);
    setBusy(true);
    try {
      const f = (k: string) => String(form.get(k) ?? "");
      const r = await startCheckoutAction(slug, {
        items: lines.map((l) => ({ productId: l.p.id, quantity: l.qty })),
        fulfillment: mode,
        customerName: f("customerName"),
        customerEmail: f("customerEmail"),
        shipTo: mode === "ship" ? { name: f("shipName") || f("customerName"), line1: f("line1"), line2: f("line2"), city: f("city"), state: f("state"), zip: f("zip") } : undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      await loadHelcimScript();
      tokenRef.current = r.checkout.checkoutToken;
      setStep("paying");
      window.appendHelcimPayIframe?.(r.checkout.checkoutToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "done") {
    return (
      <div className="card space-y-2 p-6 text-center">
        <p className="text-2xl font-bold">Thank you</p>
        <p>Your order number is <strong>{orderNumber}</strong>. Keep it for your records.</p>
        <p className="text-sm text-muted">The shop will contact you at the email you gave about {mode === "ship" ? "shipping" : "pickup"}.</p>
        <button className="btn btn-soft" onClick={() => { setStep("shop"); location.reload(); }}>Keep shopping</button>
      </div>
    );
  }

  const checkingOut = step === "details" || step === "paying";
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
      <section aria-label="Products">
        {shop.products.length === 0 && <p className="card p-4 text-muted">Nothing is for sale right now. Check back soon.</p>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {shop.products.map((p) => {
            const inCart = cart[p.id] ?? 0;
            return (
              <li key={p.id} className="card flex flex-col gap-2 p-3">
                {p.images[0] ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.images[0]} alt="" className="aspect-square w-full rounded-md object-cover" />
                  </>
                ) : null}
                <span className="font-semibold">{p.name}</span>
                {p.description && <span className="text-sm text-muted">{p.description}</span>}
                <span className="mt-auto flex items-center justify-between gap-2">
                  <span className="font-semibold">{money(p.priceCents)}</span>
                  <button type="button" className="btn btn-primary btn-sm" disabled={checkingOut || inCart >= p.available} onClick={() => setQty(p.id, inCart + 1)}>
                    {inCart >= p.available ? "All in cart" : "Add to cart"}
                  </button>
                </span>
                {p.available <= 3 && <span className="text-xs text-muted">{p.available} left</span>}
              </li>
            );
          })}
        </ul>
      </section>

      <aside className="card h-fit space-y-3 p-4" aria-label="Cart">
        <h2 className="font-bold">Your cart</h2>
        {lines.length === 0 && <p className="text-sm text-muted">Your cart is empty.</p>}
        <ul className="divide-y divide-line text-sm">
          {lines.map(({ p, qty }) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="flex items-center gap-1">
                <button type="button" className="btn btn-soft btn-sm" disabled={checkingOut} onClick={() => setQty(p.id, qty - 1)} aria-label={`Remove one ${p.name}`}>-</button>
                <span className="w-6 text-center">{qty}</span>
                <button type="button" className="btn btn-soft btn-sm" disabled={checkingOut || qty >= p.available} onClick={() => setQty(p.id, qty + 1)} aria-label={`Add one ${p.name}`}>+</button>
              </span>
              <span className="w-16 text-right">{money(p.priceCents * qty)}</span>
            </li>
          ))}
        </ul>
        {lines.length > 0 && (
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div>
            {tax > 0 && <div className="flex justify-between"><dt>Tax</dt><dd>{money(tax)}</dd></div>}
            {shipping > 0 && <div className="flex justify-between"><dt>Shipping</dt><dd>{money(shipping)}</dd></div>}
            <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{money(total)}</dd></div>
          </dl>
        )}
        {lines.length > 0 && !canShip && !canPickup && <p className="text-sm text-red-700">Some items in your cart cannot be bought together. Remove one.</p>}

        {!checkingOut && <button className="btn btn-primary w-full" disabled={lines.length === 0 || (!canShip && !canPickup)} onClick={() => setStep("details")}>Checkout</button>}

        {checkingOut && (
          <form className="space-y-3" action={pay}>
            <fieldset className="space-y-1 text-sm" disabled={busy || step === "paying"}>
              <legend className="label">How do you want it?</legend>
              <label className="flex items-center gap-2"><input type="radio" name="fulfillment" checked={mode === "pickup"} disabled={!canPickup} onChange={() => setFulfillment("pickup")} />Pickup</label>
              <label className="flex items-center gap-2"><input type="radio" name="fulfillment" checked={mode === "ship"} disabled={!canShip} onChange={() => setFulfillment("ship")} />Ship it ({money(shop.shippingFlatCents)})</label>
            </fieldset>
            <label className="block"><span className="label">Your name</span><input name="customerName" className="input" required autoComplete="name" /></label>
            <label className="block"><span className="label">Email</span><input name="customerEmail" type="email" className="input" required autoComplete="email" /></label>
            {mode === "ship" && (
              <div className="space-y-2">
                <label className="block"><span className="label">Street address</span><input name="line1" className="input" required autoComplete="address-line1" /></label>
                <label className="block"><span className="label">Apartment, suite (optional)</span><input name="line2" className="input" autoComplete="address-line2" /></label>
                <div className="grid grid-cols-[1fr_5rem_6rem] gap-2">
                  <label className="block"><span className="label">City</span><input name="city" className="input" required autoComplete="address-level2" /></label>
                  <label className="block"><span className="label">State</span><input name="state" className="input" required maxLength={2} autoComplete="address-level1" /></label>
                  <label className="block"><span className="label">ZIP</span><input name="zip" className="input" required autoComplete="postal-code" /></label>
                </div>
              </div>
            )}
            {error && <p role="alert" className="rounded-md bg-surface-2 p-2 text-sm text-red-700">{error}</p>}
            <button className="btn btn-primary w-full" disabled={busy || step === "paying"}>{busy ? "One moment" : `Pay ${money(total)}`}</button>
            {step === "details" && <button type="button" className="btn btn-ghost btn-sm w-full" onClick={() => { setError(null); setStep("shop"); }}>Back to the cart</button>}
          </form>
        )}
      </aside>
    </div>
  );
}
