import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isManager } from "@evergreen/core";
import { getCtx } from "../../../lib/services/ctx";
import { listOrdersForStaff, type OrderFilter } from "../../../lib/services/orders";
import { OrderList } from "./OrderList";

export const metadata: Metadata = { title: "Orders" };

const TABS: { key: OrderFilter; label: string }[] = [
  { key: "attention", label: "Needs attention" },
  { key: "open", label: "In progress" },
  { key: "all", label: "All" },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const ctx = await getCtx();
  if (!ctx.workspace.settings.shop.enabled) redirect("/today");
  const { show } = await searchParams;
  const filter: OrderFilter = show === "open" || show === "all" ? show : "attention";
  const rows = await listOrdersForStaff(ctx, filter);
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
          payment,
        }))}
      />
    </div>
  );
}
