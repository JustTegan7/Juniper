"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adjustStockAction, archiveProductAction, saveProductAction } from "../actions";
import { Dialog } from "../../../components/app/Dialog";
import { useAct } from "../../../components/app/useAct";
import { formObject } from "../../../lib/form";

type P = { id: string; sku: string; name: string; description: string | null; priceCents: number; active: boolean; shippingAllowed: boolean; pickupAllowed: boolean; onHand: number };

const dollars = (c: number) => (c / 100).toFixed(2);

export function ProductManager({ products }: { products: P[] }) {
  const [editing, setEditing] = useState<P | "new" | null>(null);
  const [stockFor, setStockFor] = useState<P | null>(null);
  return (
    <div className="space-y-4">
      <button className="btn btn-primary" onClick={() => setEditing("new")}>Add product</button>
      {products.length === 0 && <p className="card p-4 text-muted">No products yet.</p>}
      <ul className="card divide-y divide-line">
        {products.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span>
              <span className="font-semibold">{p.name}</span>
              <span className="block text-xs text-muted">{p.sku} · ${dollars(p.priceCents)}{p.active ? "" : " · Hidden"}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold">{p.onHand} in stock</span>
              <button className="btn btn-soft btn-sm" onClick={() => setStockFor(p)}>Stock</button>
              <button className="btn btn-soft btn-sm" onClick={() => setEditing(p)}>Edit</button>
            </span>
          </li>
        ))}
      </ul>
      <ProductDialog product={editing} onClose={() => setEditing(null)} />
      <StockDialog product={stockFor} onClose={() => setStockFor(null)} />
    </div>
  );
}

function ProductDialog({ product, onClose }: { product: P | "new" | null; onClose: () => void }) {
  const router = useRouter();
  const { act, pending } = useAct();
  const p = product && product !== "new" ? product : undefined;
  return (
    <Dialog open={product !== null} onClose={onClose} title={p ? "Edit product" : "Add product"}>
      {product !== null && (
        <form
          className="space-y-3"
          action={(f) =>
            act(
              () => saveProductAction({ ...formObject(f), id: p?.id, active: f.get("active") === "on", shippingAllowed: f.get("shippingAllowed") === "on", pickupAllowed: f.get("pickupAllowed") === "on" }),
              () => {
                onClose();
                router.refresh();
              },
            )
          }
        >
          <label className="block"><span className="label">Name</span><input name="name" className="input" defaultValue={p?.name} required /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">SKU</span><input name="sku" className="input uppercase" defaultValue={p?.sku} required /></label>
            <label className="block"><span className="label">Price</span><input name="price" inputMode="decimal" className="input" defaultValue={p ? dollars(p.priceCents) : ""} required /></label>
          </div>
          <label className="block"><span className="label">Description</span><textarea name="description" className="input" rows={2} defaultValue={p?.description ?? ""} /></label>
          {!p && <label className="block"><span className="label">Starting stock</span><input name="startingStock" type="number" min={0} className="input" defaultValue={0} /></label>}
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input name="active" type="checkbox" defaultChecked={p?.active ?? true} />For sale</label>
            <label className="flex items-center gap-2"><input name="pickupAllowed" type="checkbox" defaultChecked={p?.pickupAllowed ?? true} />Pickup</label>
            <label className="flex items-center gap-2"><input name="shippingAllowed" type="checkbox" defaultChecked={p?.shippingAllowed ?? true} />Shipping</label>
          </div>
          <div className="flex justify-between gap-2">
            <button className="btn btn-primary" disabled={pending}>Save</button>
            {p && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pending}
                onClick={() => {
                  if (confirm("Remove this product from the shop? Past orders keep their details.")) act(() => archiveProductAction({ id: p.id }), () => { onClose(); router.refresh(); });
                }}
              >
                Remove
              </button>
            )}
          </div>
        </form>
      )}
    </Dialog>
  );
}

function StockDialog({ product, onClose }: { product: P | null; onClose: () => void }) {
  const router = useRouter();
  const { act, pending } = useAct();
  return (
    <Dialog open={product !== null} onClose={onClose} title={product ? `Stock: ${product.name}` : "Stock"}>
      {product && (
        <div className="space-y-5">
          <p className="text-sm">On hand now: <strong>{product.onHand}</strong></p>
          <form className="space-y-2" action={(f) => act(() => adjustStockAction({ kind: "receive", productId: product.id, quantity: f.get("quantity"), note: f.get("note") }), () => { onClose(); router.refresh(); })}>
            <h3 className="font-semibold">Receive stock</h3>
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <input name="quantity" type="number" min={1} className="input" placeholder="How many" required aria-label="Quantity received" />
              <input name="note" className="input" placeholder="Note (optional)" aria-label="Note" />
            </div>
            <button className="btn btn-primary btn-sm" disabled={pending}>Add to stock</button>
          </form>
          <form className="space-y-2" action={(f) => act(() => adjustStockAction({ kind: "adjust", productId: product.id, quantity: f.get("quantity"), note: f.get("note") }), () => { onClose(); router.refresh(); })}>
            <h3 className="font-semibold">Correct the count</h3>
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <input name="quantity" type="number" className="input" placeholder="+/-" required aria-label="Change" />
              <input name="note" className="input" placeholder="Why (damaged, miscount, lost)" required aria-label="Reason" />
            </div>
            <button className="btn btn-soft btn-sm" disabled={pending}>Apply change</button>
          </form>
        </div>
      )}
    </Dialog>
  );
}
