import { startOnlineCheckout } from "../../../../../lib/services/online-orders";
import { shopOptions, shopRoute } from "../_handler";

export const dynamic = "force-dynamic";
export const OPTIONS = shopOptions;
/** Body: { items: [{ productId, quantity }], fulfillment: "pickup" | "ship", customerName, customerEmail, shipTo? }. Returns { checkoutToken, orderNumber, totalCents }. */
export const POST = shopRoute(async (slug, req) => startOnlineCheckout(slug, await req.json().catch(() => null)), "POST");
