// Plain text receipts. Same text works for email now and for a text message later.

export interface ReceiptOrder {
  orderNumber: number;
  channel: "in_person" | "online";
  fulfillment: "counter" | "pickup" | "ship";
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  customerName: string | null;
  paidAt: Date | null;
  shipTo?: { name?: string; line1?: string; line2?: string | null; city?: string; state?: string; zip?: string } | null;
}
export interface ReceiptItem { name: string; sku: string; unitPriceCents: number; quantity: number }
export interface ReceiptBusiness { name: string; timezone: string; phone?: string; address?: string }

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export function buildReceipt(o: ReceiptOrder, items: ReceiptItem[], b: ReceiptBusiness): { subject: string; text: string } {
  const when = o.paidAt ? o.paidAt.toLocaleString("en-US", { timeZone: b.timezone, dateStyle: "medium", timeStyle: "short" }) : "";
  const lines = [
    `${o.customerName ? `Hi ${o.customerName.split(" ")[0]}, thank` : "Thank"} you for your purchase from ${b.name}.`,
    "",
    `Order ${o.orderNumber}${when ? ` · ${when}` : ""}`,
    "",
    ...items.map((i) => `${i.quantity} x ${i.name} (${i.sku})  ${money(i.unitPriceCents * i.quantity)}`),
    "",
    `Subtotal: ${money(o.subtotalCents)}`,
    ...(o.taxCents > 0 ? [`Tax: ${money(o.taxCents)}`] : []),
    ...(o.shippingCents > 0 ? [`Shipping: ${money(o.shippingCents)}`] : []),
    `Total paid: ${money(o.totalCents)}`,
  ];
  if (o.fulfillment === "ship" && o.shipTo) {
    const a = o.shipTo;
    lines.push("", "Shipping to:", [a.name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", ") + (a.zip ? ` ${a.zip}` : "")].filter(Boolean).join("\n"));
  } else if (o.fulfillment === "pickup") {
    lines.push("", "This order is for pickup. We will contact you when it is ready.");
  }
  lines.push("", [b.name, b.address, b.phone].filter(Boolean).join("\n"));
  return { subject: `Your receipt from ${b.name}, order ${o.orderNumber}`, text: lines.join("\n") };
}
