"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adjustStockAction, archiveProductAction, saveProductAction } from "../actions";
import { Dialog } from "../../../components/app/Dialog";
import { useAct } from "../../../components/app/useAct";
import { formObject } from "../../../lib/form";
import { PHOTO_MAX_PER_PRODUCT } from "../../../lib/photo";

type P = { id: string; sku: string; name: string; description: string | null; priceCents: number; active: boolean; shippingAllowed: boolean; pickupAllowed: boolean; onHand: number; images: string[] };

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
            <span className="flex items-center gap-3">
              {p.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.images[0]} alt="" className="h-12 w-12 rounded-md object-cover" />
              ) : (
                <span className="h-12 w-12 rounded-md bg-line" aria-hidden />
              )}
              <span>
                <span className="font-semibold">{p.name}</span>
                <span className="block text-xs text-muted">{p.sku} · ${dollars(p.priceCents)}{p.active ? "" : " · Hidden"}</span>
              </span>
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
      {product !== null && <ProductForm key={p?.id ?? "new"} p={p} pending={pending} act={act} onDone={() => { onClose(); router.refresh(); }} />}
    </Dialog>
  );
}

function ProductForm({ p, pending, act, onDone }: { p: P | undefined; pending: boolean; act: ReturnType<typeof useAct>["act"]; onDone: () => void }) {
  const [images, setImages] = useState<string[]>(p?.images ?? []);
  return (
    <>
      <form
          className="space-y-3"
          action={(f) =>
            act(
              () => saveProductAction({ ...formObject(f), id: p?.id, images, active: f.get("active") === "on", shippingAllowed: f.get("shippingAllowed") === "on", pickupAllowed: f.get("pickupAllowed") === "on" }),
              onDone,
            )
          }
        >
          <label className="block"><span className="label">Name</span><input name="name" className="input" defaultValue={p?.name} required /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">SKU</span><input name="sku" className="input uppercase" defaultValue={p?.sku} required /></label>
            <label className="block"><span className="label">Price</span><input name="price" inputMode="decimal" className="input" defaultValue={p ? dollars(p.priceCents) : ""} required /></label>
          </div>
          <Photos images={images} setImages={setImages} />
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
                  if (confirm("Remove this product from the shop? Past orders keep their details.")) act(() => archiveProductAction({ id: p.id }), onDone);
                }}
              >
                Remove
              </button>
            )}
          </div>
      </form>
    </>
  );
}

/** Shrinks a phone photo to at most 1600px on its long side as a JPEG, so uploads stay small and fast. */
async function shrink(file: File): Promise<File> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that photo.");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  if (!blob) throw new Error("Could not read that photo.");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

function Photos({ images, setImages }: { images: string[]; setImages: (v: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const room = PHOTO_MAX_PER_PRODUCT - images.length;

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError("");
    const added: string[] = [];
    try {
      for (const f of Array.from(files).slice(0, room)) {
        const small = await shrink(f);
        const body = new FormData();
        body.set("file", small);
        const res = await fetch("/api/products/photo", { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed. Try again.");
        added.push(json.url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    }
    if (added.length) setImages([...images, ...added]);
    setBusy(false);
  }

  function addLink() {
    try {
      const u = new URL(link.trim());
      if (u.protocol !== "https:") throw new Error();
      setImages([...images, u.toString()]);
      setLink("");
      setError("");
    } catch {
      setError("Paste a full image link that starts with https://");
    }
  }

  return (
    <div className="space-y-2">
      <span className="label">Photos ({images.length}/{PHOTO_MAX_PER_PRODUCT}). The first one is the cover.</span>
      {images.length > 0 && (
        <ul className="grid grid-cols-4 gap-2">
          {images.map((src, i) => (
            <li key={src} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="aspect-square w-full rounded-md object-cover" />
              <span className="flex justify-between text-xs">
                {i === 0 ? <span className="text-muted">Cover</span> : <button type="button" className="underline" onClick={() => setImages([src, ...images.filter((x) => x !== src)])}>Make cover</button>}
                <button type="button" className="underline" onClick={() => setImages(images.filter((x) => x !== src))}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {room > 0 && (
        <>
          <label className="btn btn-soft btn-sm inline-block cursor-pointer">
            {busy ? "Uploading..." : "Add photos"}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={busy} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
          </label>
          <div className="flex gap-2">
            <input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Or paste an image link" aria-label="Image link" />
            <button type="button" className="btn btn-soft btn-sm" onClick={addLink} disabled={!link.trim()}>Add</button>
          </div>
        </>
      )}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </div>
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
