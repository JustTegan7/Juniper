# Juniper storefront, inventory and Helcim spec

Status: draft, 2026-11-13. Not built yet. Client: ReLoved Gaming (owns its own Helcim account and hardware).

## 1. Decisions already made
- Juniper owns storefront, products, stock and orders. Helcim is payments and card hardware only. No sync with Helcim inventory (Helcim has no product or inventory API).
- In person, Juniper is the POS. Employee rings up the sale in Juniper, Juniper sends a payment request to the Helcim device through the Payment Hardware API using the device code, customer taps or inserts.
- Stock comes out only after Helcim confirms payment. A 202 from the API is not confirmation.
- Every sale starts in Juniper. API mode turns off the built-in Helcim POS on every Smart Terminal on the account.
- Online checkout uses HelcimPay.js. Every Helcim request carries our partner token.
- Products are flat SKUs, no variants. Fulfillment is shipping or local pickup.
- v1 runs as a web app on any browser, no desktop app. The register only calls Juniper's server, which calls Helcim. Cash is a tender type in Juniper that records the sale without calling Helcim, and still writes stock.
- Rules from CLAUDE.md apply: workspace_id on every table, UUIDv7, soft delete, service functions `(ctx, input)` with zod, audit rows for changes that matter, no em dashes.

## 2. What Helcim's docs say (checked 2026-11-13)
- Start a purchase: `POST /v2/devices/{code}/payment/purchase`, from the server. Headers `api-token` and `idempotency-key` (25 characters, alphanumeric). Body `currency`, `transactionAmount`, optional `invoiceNumber`, `customerCode`. If the invoice number exists the payment links to it, otherwise a new invoice gets that number.
- Responses: 202 accepted (not completed), 403 bad token, 404 device not found or not registered, 409 device not listening (off, logged out, asleep), 500.
- No queue. Two requests to one device at once are not handled. Juniper must allow one in-flight payment per device.
- `cardTransaction` webhook payload is only `{ id, type }`. No amount, invoice number or device. Fetch the transaction by id to get details.
- `terminalCancel` webhook payload has `cancelledAt, currency, customerCode, deviceCode, invoiceNumber, transactionAmount`.
- Webhook headers `webhook-signature`, `webhook-timestamp`, `webhook-id`. Signed content is `webhook-id.webhook-timestamp.body`, HMAC-SHA256 with the base64-decoded verifier token, base64 output. Reply 2xx. Retries run roughly immediately, 5s, 5m, 30m, 2h, 5h, 10h, 10h.
- Partner program: send `partner-token` with the merchant `api-token` on HelcimPay.js, Payment API and Payment Hardware API calls. Helcim cannot attribute missed transactions later. Docs publish a test partner token for development. Approval is at Helcim's discretion, and each merchant must agree to the partner terms.
- Testing needs a developer test account from Helcim Tier 2 support.

### Conflicts in the docs (do not rely on either until tested)
1. Card Reader Gen3 support. The Payment Hardware API overview lists devices differently depending on the read (Smart Terminal Gen1 and Gen2 only, or with Card Reader Gen3). A Helcim help page says the API works with Smart Terminal and Card Reader Gen3. Test with a real purchase.
2. Cancelled payments. The purchase guide says a cancel or timeout sends no webhook. The webhook guide says `cardTransaction` fires for approved, declined or cancelled, and `terminalCancel` fires on cancel. Handle all three paths plus a timeout.
3. Whether the fetched card transaction returns `invoiceNumber` and the device code is not confirmed in the pages I could read. Verify in the first test.
4. Whether HelcimPay.js online payments trigger the same `cardTransaction` webhook. Verify, and do not depend on it for online confirmation.

## 3. Data model (new tables, all with workspace_id, id UUIDv7, created_at, updated_at, deleted_at)
- `products`: sku (unique per workspace), name, description, price_cents, active, shipping_allowed, pickup_allowed, images. No stock column.
- `stock_movements`: product_id, delta, reason (`receive`, `sale`, `online_sale`, `adjust`, `return`, `void`), order_id nullable, note, created_by. On-hand is the sum of deltas. Never edit rows, add a correcting row.
- `orders`: order_number (human, per workspace, used as the Helcim invoiceNumber), channel (`in_person`, `online`), status, subtotal, tax, shipping, total (cents), fulfillment (`ship`, `pickup`, `counter`), customer name and email, created_by.
- `order_items`: order_id, product_id, sku and name and unit price copied at sale time, quantity.
- `payments`: order_id, channel, status (`pending`, `approved`, `declined`, `cancelled`, `timed_out`, `refunded`), amount_cents, helcim_transaction_id (unique), device_id nullable, idempotency_key, requested_at, resolved_at, raw_response.
- `helcim_connections`: one per workspace. api_token and verifier_token stored encrypted. Partner token is a deploy env var, not per business.
- `helcim_devices`: connection_id, code, kind (`smart_terminal`, `card_reader`), label, location, last_ping_at, active.
- `webhook_events`: webhook_id (unique), received_at, type, helcim_id, processed_at, result. This is the dedupe table.

## 4. States
Order: `draft` then `awaiting_payment` then `paid` then `fulfilled`, or `cancelled` from draft or awaiting_payment, `refunded` after.
Stock is written only on the move to `paid`.

## 5. In-person flow
1. Employee builds the cart in Juniper. Juniper checks on-hand stock for display only.
2. Employee picks a device and taps Charge. In one transaction Juniper creates the order (`awaiting_payment`) and a `payments` row (`pending`), and refuses if that device already has a pending payment.
3. Server calls the purchase endpoint with `invoiceNumber = order_number`, amount, currency USD, an idempotency key stored on the payment row, and the partner token.
4. 404 or 409 mean nothing was sent: mark the payment `cancelled`, show the reason ("device is asleep, wake it and retry"). 202 means wait.
5. The POS screen polls our own payment status (not Helcim) every 2 seconds, with a cancel button and a timeout.
6. Resolution comes from section 6. On `approved`, order goes `paid`, stock rows are written, receipt shown.
7. Timeout reaper: a payment `pending` for more than 5 minutes is looked up in Helcim by invoice number. Approved there: resolve as paid. Nothing there: mark `timed_out` and free the device. Never guess.

## 6. Webhook handler (`/api/webhooks/helcim/[connectionKey]`)
One URL per merchant connection because verifier tokens are per Helcim account.
1. Verify signature and timestamp (reject if older than 5 minutes). Bad signature: 401, store nothing.
2. Insert into `webhook_events` on webhook_id. Duplicate: return 200 and stop.
3. `cardTransaction`: fetch the transaction by id with that merchant's api-token. Trust the fetched record, not the webhook body. Match to a payment by invoice number (fall back to device code plus amount plus pending state, and flag it if the fallback was used). If approved, mark approved and write stock. If declined, mark declined, no stock. Unique helcim_transaction_id stops double processing.
4. `terminalCancel`: match on invoiceNumber and deviceCode, mark `cancelled`, free the device. Only if still `pending`.
5. Return 200 fast. Do the fetch inside the handler but keep it under a few seconds, and on a fetch failure return 500 so Helcim retries.
6. Stock write and status change happen in one `batch([...])` with an audit row.

## 7. Online checkout (HelcimPay.js)
1. Server creates the order and a HelcimPay.js checkout session (amount, invoiceNumber = order_number, partner token header). Returns the checkout token to the browser. The secret token stays on the server.
2. Browser opens HelcimPay.js. Juniper never sees card data.
3. On the success event the browser posts the response to our server. Server validates the response hash with the secret token before trusting it. Then marks paid and writes stock.
4. Stock hold: when checkout starts, write a 15 minute hold (not a stock movement). Hold expires on its own. If a payment still lands for an item that sold out, flag the order for refund instead of overselling quietly.
5. Shipping versus pickup chosen before the session is created, since it changes the total.

## 8. Partner token
- Env var `HELCIM_PARTNER_TOKEN`. Use the documented test token in development only.
- Helcim's responses carry a header that says whether attribution worked. Log it on every call and alert on a miss.
- Action for Tegan: apply at helcim.com/integration-partners. Until approved, the token is the test token and no revenue share is earned.

## 9. Hardware and returns (from helcim.com and legal.helcim.com, 2026-11-13)
- Card Reader listed at $199 USD. Smart Terminal $349 USD, or $32 per month for 12 months. The $99 figure did not show up on Helcim's own page.
- Return window 30 days from delivery, original condition and packaging, only if bought directly from Helcim or an authorized reseller. Helcim pays return shipping. Original shipping is not refunded. No restocking fee is mentioned. Financed hardware is only returnable inside the 30 days. Warranty one year on both devices.
- Buying one of each for testing is low risk if tests finish inside the 30 days. Ask Helcim which account the test devices should sit on. API mode is account wide, so do not enable it on ReLoved's live account until Juniper POS is ready.

## 10. Test plan (one Smart Terminal, one Card Reader Gen3)
Setup: developer test account from Helcim Tier 2 support, webhook URL pointed at a Vercel preview, API mode on, register devices, note the device codes.

For each device, in this order:
1. Ping and get device info.
2. Purchase of $1.00 with order number as invoiceNumber. Expect 202, then a webhook. Record exactly what the webhook and the fetched transaction contain. This settles conflicts 1 and 3.
3. Customer cancels on the device. Record which webhooks fire. Settles conflict 2.
4. Let the device time out with no card. Record what arrives.
5. Declined card (Helcim test cards).
6. Device off or asleep: expect 409, confirm no order stays stuck.
7. Two quick charges to one device: confirm Juniper blocks the second.
8. Same webhook delivered twice (replay): stock written once.
9. Bad signature and old timestamp: rejected.
10. Webhook arrives before the 202 response is processed: still resolves correctly.
11. Refund of a test sale, stock goes back with a `return` row.
12. Partner token attribution header equals 1 on every call.

Card Reader Gen3 only: if step 2 fails with a device or support error, the reader cannot be driven by the API. Then ReLoved's shop POS runs on a Smart Terminal, or the reader is used only with Helcim's own app and Juniper records the sale by hand. Do not promise the reader to ReLoved until step 2 passes on a real purchase.

Online: HelcimPay.js test payment, hash validation, tampered response rejected, hold expiry, oversell flag.

## 11. Open items
| Item | Status |
| --- | --- |
| Card Reader Gen3 supported by the hardware API | Unresolved, test step 2 |
| Webhook detail enough to match orders | Likely yes via fetch by id plus invoiceNumber, confirm in step 2 |
| Cancel behavior | Docs conflict, handled three ways, confirm in step 3 |
| Card Reader price | $199 on Helcim's page, confirm at checkout |
| Return terms | 30 days from delivery, see section 9 |
| Partner program | Not applied yet, Tegan to apply |
| Developer test account | Request from Helcim Tier 2 support |

## 12. Build order
1. Schema and migrations, product CRUD, stock ledger, tests.
2. Helcim client module (typed, partner token, idempotency) and webhook route with signature tests.
3. POS flow and payment state machine, with a fake Helcim for tests.
4. Hardware test day using section 10.
5. HelcimPay.js checkout and the storefront pages on the ReLoved site.
6. Add POS screens to the phone app.
