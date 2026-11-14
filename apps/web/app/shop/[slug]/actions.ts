"use server";

import { toResult } from "../../../lib/action-result";
import { confirmOnlinePayment, startOnlineCheckout } from "../../../lib/services/online-orders";

// Public actions. Scoped by the shop slug. The browser sends a cart and contact details, never prices.

export async function startCheckoutAction(slug: string, input: unknown) {
  let out: Awaited<ReturnType<typeof startOnlineCheckout>> | null = null;
  const r = await toResult(async () => {
    out = await startOnlineCheckout(String(slug), input);
    return { message: "Ready to pay." };
  }, false);
  if (!r.ok) return r;
  return { ...r, checkout: out! };
}

export async function confirmPaymentAction(slug: string, input: unknown) {
  return confirmOnlinePayment(String(slug), input);
}
