import { confirmOnlinePayment } from "../../../../../lib/services/online-orders";
import { shopOptions, shopRoute } from "../_handler";

export const dynamic = "force-dynamic";
export const OPTIONS = shopOptions;
/** Body: { checkoutToken, response } where response is the parsed HelcimPay.js success message. Returns { ok, orderNumber } or { ok: false, message }. */
export const POST = shopRoute(async (slug, req) => confirmOnlinePayment(slug, await req.json().catch(() => null)), "POST");
