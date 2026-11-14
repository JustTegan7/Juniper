/** Pure money math. Tax is shared by item value, and the last item takes whatever rounding is left. */
export function refundAmounts(o: { subtotalCents: number; taxCents: number; shippingCents: number }, lines: { unitPriceCents: number; quantity: number }[], done: { tax: number; shipping: number }, finishesItems: boolean, includeShipping: boolean) {
  const itemsCents = lines.reduce((n, l) => n + l.unitPriceCents * l.quantity, 0);
  const share = o.subtotalCents > 0 ? Math.round((o.taxCents * itemsCents) / o.subtotalCents) : 0;
  const taxCents = Math.max(0, Math.min(finishesItems ? o.taxCents - done.tax : share, o.taxCents - done.tax));
  const shippingCents = includeShipping ? Math.max(0, o.shippingCents - done.shipping) : 0;
  return { itemsCents, taxCents, shippingCents, totalCents: itemsCents + taxCents + shippingCents };
}

