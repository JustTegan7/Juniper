# Shop API

Lets a business's own website (for example ReLoved's) sell products that live in Juniper. Juniper holds products, stock, orders and the Helcim connection. The website only shows things and sends the customer to pay.

## Turn it on
1. Settings, Shop and register: turn on "Sell products" and "Open the online shop".
2. Connect Helcim (Settings, Card payments) and add products with stock.
3. Add the website address under "Websites that can use the shop API", for example `https://reloved.example.com`. https only.
4. In Helcim, when creating the API token, tick the HelcimPay checkout option and add the same website address as a checkout URL. Without it the card form will not render on a live account.

Base URL: `https://<juniper-host>/api/shop/<slug>`

## Endpoints
All JSON. No login. Browser calls must come from an allowed website, otherwise 403.

`GET /products` returns `{ business, products: [{ id, sku, name, description, priceCents, images, available, shippingAllowed, pickupAllowed }], taxRatePercent, shippingFlatCents }`. `available` already subtracts stock other customers are holding in the last 15 minutes. Do not cache it.

`POST /checkout` body:
```json
{ "items": [{ "productId": "...", "quantity": 1 }], "fulfillment": "pickup", "customerName": "Ana", "customerEmail": "ana@example.com", "shipTo": { "name": "", "line1": "", "line2": "", "city": "", "state": "", "zip": "" } }
```
`shipTo` is required when `fulfillment` is `ship`. Returns `{ checkoutToken, orderNumber, totalCents }`. Prices, tax and shipping are always worked out by Juniper, never taken from the request.

`POST /confirm` body `{ "checkoutToken": "...", "response": <parsed HelcimPay.js success message> }`. Returns `{ ok: true, orderNumber }` or `{ ok: false, message }`. Juniper checks the payment hash and amount itself. A result that does not check out is flagged for staff, never marked paid.

Errors come back as `{ "error": "..." }` with status 400 (bad request or out of stock), 403 (website not allowed), or 404 (shop not open).

## Browser flow
```js
const api = "https://<juniper-host>/api/shop/<slug>";
const { checkoutToken } = await (await fetch(`${api}/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cart) })).json();

// Load https://secure.helcim.app/helcim-pay/services/start.js once, then:
window.addEventListener("message", async (event) => {
  if (event.data?.eventName !== `helcim-pay-js-${checkoutToken}`) return;
  if (event.data.eventStatus === "SUCCESS") {
    const response = JSON.parse(event.data.eventMessage);
    const r = await (await fetch(`${api}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ checkoutToken, response }) })).json();
    removeHelcimPayIframe();
    // r.ok then show the thank you with r.orderNumber
  }
  if (event.data.eventStatus === "ABORTED") { removeHelcimPayIframe(); /* declined, nothing charged */ }
  if (event.data.eventStatus === "HIDE") { removeHelcimPayIframe(); /* closed */ }
});
appendHelcimPayIframe(checkoutToken);
```

## Notes
- The receipt email goes out automatically after a confirmed payment.
- Open orders that never get paid cancel after an hour.
- The ready-made shop page at `/shop/<slug>` works with no website of your own.
- Unverified until hardware test day: the exact HelcimPay.js result shape and hash details. Juniper accepts the documented variants and fails closed.
