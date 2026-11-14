import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isManager } from "@evergreen/core";
import { getCtx } from "../../../lib/services/ctx";
import { listProducts } from "../../../lib/services/products";
import { ProductManager } from "./ProductManager";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage() {
  const ctx = await getCtx();
  if (!isManager(ctx.role) || !ctx.workspace.settings.shop.enabled) redirect("/today");
  const rows = await listProducts(ctx, { includeInactive: true });
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Products</h1>
      <ProductManager
        products={rows.map((p) => ({ id: p.id, sku: p.sku, name: p.name, description: p.description, priceCents: p.priceCents, active: p.active, shippingAllowed: p.shippingAllowed, pickupAllowed: p.pickupAllowed, onHand: p.onHand }))}
      />
    </div>
  );
}
