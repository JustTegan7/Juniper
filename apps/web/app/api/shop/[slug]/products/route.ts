import { loadShop } from "../../../../../lib/services/online-orders";
import { shopOptions, shopRoute } from "../_handler";

export const dynamic = "force-dynamic";
export const OPTIONS = shopOptions;
export const GET = shopRoute(async (slug) => {
  const shop = await loadShop(slug);
  if (!shop) throw new Error("This shop is not open.");
  return shop;
}, "GET");
