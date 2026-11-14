import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCtx } from "../../../lib/services/ctx";
import { listProducts } from "../../../lib/services/products";
import { loadHelcimSettingsForRegister } from "../../../lib/services/helcim-connection";
import { listRecentOrders, reapStalePayments } from "../../../lib/services/orders";
import { Register } from "./Register";

export const metadata: Metadata = { title: "Register" };

export default async function RegisterPage() {
  const ctx = await getCtx();
  if (!ctx.workspace.settings.shop.enabled) redirect("/today");
  await reapStalePayments(ctx.workspace.id);
  const [products, devices, recent] = await Promise.all([listProducts(ctx), loadHelcimSettingsForRegister(ctx), listRecentOrders(ctx, 8)]);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Register</h1>
      <Register
        products={products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, priceCents: p.priceCents, onHand: p.onHand }))}
        devices={devices}
        taxRatePercent={ctx.workspace.settings.shop.taxRatePercent}
        recent={recent.map((o) => ({ id: o.id, orderNumber: o.orderNumber, status: o.status, totalCents: o.totalCents }))}
      />
    </div>
  );
}
