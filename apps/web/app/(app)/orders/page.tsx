import type { Metadata } from "next";
import Link from "next/link";
import { isManager } from "@evergreen/core";
import { getCtx, requireModule } from "../../../lib/services/ctx";
import { listOrdersForStaff, type OrderFilter } from "../../../lib/services/orders";
import { listRefunds } from "../../../lib/services/refunds";
import { OrderList } from "./OrderList";

export const metadata: Metadata = { title: "Orders" };

const TABS: { key: OrderFilter; label: string }[] = [
  { key: "attention", label: "Needs attention" },
  { key: "open", label: "In progress" },
  { key: "all", label: "All" },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const ctx = await getCtx();
  requireModule(ctx, "shop");
  const { show } = await searchParams;
  const filter: OrderFilter = show === "open" || show === "all" ? show : "attention";
  const rows = await listOrdersForStaff(ctx, filter);
  const refundRows = await listRefunds(ctx.workspace.id, rows.map((r) => r.order.id));
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Orders</h1>
      <nav aria-label="Order filter" className="flex gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "attention" ? "/orders" : `/orders?show=${t.key}`} className={`btn btn-sm ${filter === t.key ? "btn-primary" : "btn-soft"}`} aria-current={filter === t.key ? "page" : undefined}>{t.label}</Link>
        ))}
      </nav>
      <OrderList
        canResolve={isManager(ctx.role)}
        orders={rows.map(({ order: o, items, payment }) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          channel: o.channel,
          status: o.status,
          fulfillment: o.fulfillment,
          totalCents: o.totalCents,
          customerName: o.customerName,
          customerEmail: o.customerEmail,
          shipTo: (o.shipTo as Record<string, string | null> | null) ?? null,
          createdAt: o.createdAt.toISOString(),
          items: items.map((i) => ({ id: i.id, name: i.name, sku: i.sku, quantity: i.quantity, unitPriceCents: i.unitPriceCents })),
          shippingCents: o.shippingCents,
          refunds: refundRows.filter((r) => r.orderId === o.id).map((r) => ({ id: r.id, status: r.status, method: r.method, amountCents: r.amountCents, shippingCents: r.shippingCents, reason: r.reason, items: r.items as { orderItemId: string; quantity: number }[] })),
          payment,
        }))}
      />
    </div>
  );
}
