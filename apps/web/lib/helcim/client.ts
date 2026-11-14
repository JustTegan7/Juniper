import "server-only";
import { createHash, randomBytes } from "node:crypto";

// Thin typed wrapper over the Helcim calls Juniper needs. The caller passes the business's decrypted api token.
// The partner token (HELCIM_PARTNER_TOKEN) rides on every call so revenue share is attributed.

const BASE = "https://api.helcim.com/v2";

export class HelcimError extends Error {
  constructor(
    message: string,
    /** Helcim HTTP status, or 0 when the request never got an answer. */
    readonly status: number,
    /** True when we know the device was not sent anything, so the payment can safely be marked cancelled. */
    readonly notSent: boolean,
  ) {
    super(message);
  }
}

export interface HelcimAuth {
  apiToken: string;
  partnerToken?: string;
}

type Fetch = typeof fetch;

/** 25 character alphanumeric key, as Helcim's idempotency-key header requires. */
export function newIdempotencyKey(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(25);
  let out = "";
  for (let i = 0; i < 25; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

function headers(auth: HelcimAuth, extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { "api-token": auth.apiToken, accept: "application/json", ...extra };
  if (auth.partnerToken) h["partner-token"] = auth.partnerToken;
  return h;
}

/** Plain words for a status Helcim returned when starting a purchase. Safe to show staff. */
export function purchaseErrorMessage(status: number): string {
  if (status === 404) return "That card device was not found. Check its code in Settings.";
  if (status === 409) return "The card device is not listening. Wake it up and make sure it is signed in, then try again.";
  if (status === 403) return "Helcim rejected the connection. Reconnect Helcim in Settings.";
  return "Helcim could not take the request right now. Try again in a moment.";
}

export interface StartPurchaseInput {
  deviceCode: string;
  amountCents: number;
  currency: string;
  /** Our order number. Helcim links the payment to the invoice with this number. */
  invoiceNumber: string;
  idempotencyKey: string;
}

/**
 * Sends a payment request to a device. A 202 only means Helcim accepted it, not that the customer paid.
 * Resolves on 202. Throws HelcimError otherwise, with notSent true for the statuses that mean nothing reached the device.
 */
export async function startPurchase(auth: HelcimAuth, input: StartPurchaseInput, fetchImpl: Fetch = fetch): Promise<void> {
  const body = JSON.stringify({
    currency: input.currency,
    transactionAmount: Number((input.amountCents / 100).toFixed(2)),
    invoiceNumber: input.invoiceNumber,
  });
  let res: Response;
  try {
    res = await fetchImpl(`${BASE}/devices/${encodeURIComponent(input.deviceCode)}/payment/purchase`, {
      method: "POST",
      headers: headers(auth, { "content-type": "application/json", "idempotency-key": input.idempotencyKey }),
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Unknown whether Helcim got it. Not safe to call this "not sent". The timeout reaper settles it.
    throw new HelcimError("No answer from Helcim", 0, false);
  }
  if (res.status === 202) return;
  throw new HelcimError(purchaseErrorMessage(res.status), res.status, res.status === 404 || res.status === 409 || res.status === 403);
}

export interface CardTransaction {
  transactionId: string;
  status: "approved" | "declined" | "other";
  amountCents: number | null;
  invoiceNumber: string | null;
  deviceCode: string | null;
  raw: unknown;
}

/** Looks up a transaction by id. We trust this record, never the webhook body. Field names are confirmed on test day. */
export async function getCardTransaction(auth: HelcimAuth, transactionId: string, fetchImpl: Fetch = fetch): Promise<CardTransaction> {
  const res = await fetchImpl(`${BASE}/card-transactions/${encodeURIComponent(transactionId)}`, { headers: headers(auth), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new HelcimError(`Helcim lookup failed (${res.status})`, res.status, false);
  const j = (await res.json()) as Record<string, unknown>;
  const rawStatus = String(j.status ?? "").toUpperCase();
  const amount = typeof j.amount === "number" ? j.amount : typeof j.transactionAmount === "number" ? j.transactionAmount : null;
  return {
    transactionId: String(j.transactionId ?? transactionId),
    status: rawStatus === "APPROVED" ? "approved" : rawStatus === "DECLINED" ? "declined" : "other",
    amountCents: amount === null ? null : Math.round(amount * 100),
    invoiceNumber: typeof j.invoiceNumber === "string" ? j.invoiceNumber : null,
    deviceCode: typeof j.deviceCode === "string" ? j.deviceCode : null,
    raw: j,
  };
}

export interface InitializePayInput {
  amountCents: number;
  currency: string;
  invoiceNumber: string;
}

/**
 * Starts a HelcimPay.js checkout session. Must run on the server (the API rejects browser calls).
 * The checkoutToken goes to the browser. The secretToken must never leave the server, it validates the result.
 * Field names follow the HelcimPay.js docs. invoiceNumber on initialize is UNVERIFIED, confirm on test day.
 */
export async function initializeHelcimPay(auth: HelcimAuth, input: InitializePayInput, fetchImpl: Fetch = fetch): Promise<{ checkoutToken: string; secretToken: string }> {
  let res: Response;
  try {
    res = await fetchImpl(`${BASE}/helcim-pay/initialize`, {
      method: "POST",
      headers: headers(auth, { "content-type": "application/json" }),
      body: JSON.stringify({ paymentType: "purchase", amount: Number((input.amountCents / 100).toFixed(2)), currency: input.currency, invoiceNumber: input.invoiceNumber, language: "en" }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HelcimError("Card payments are not available right now. Try again in a moment.", 0, true);
  }
  if (!res.ok) throw new HelcimError("Card payments are not available right now. Try again in a moment.", res.status, true);
  const json = (await res.json().catch(() => null)) as { checkoutToken?: unknown; secretToken?: unknown } | null;
  if (!json || typeof json.checkoutToken !== "string" || typeof json.secretToken !== "string") throw new HelcimError("Card payments are not available right now. Try again in a moment.", res.status, true);
  return { checkoutToken: json.checkoutToken, secretToken: json.secretToken };
}

/** JSON the way Helcim hashes it: compact, non-ASCII escaped as \uXXXX. Slash escaping is ambiguous in their docs, so callers try both. */
export function helcimJson(data: unknown, escapeSlashes: boolean): string {
  let out = JSON.stringify(data).replace(/[\u0080-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  if (escapeSlashes) out = out.replace(/\//g, "\\/");
  return out;
}

/** Checks a HelcimPay.js result against the secretToken. Fails closed. */
export function verifyPayHash(response: unknown, secretToken: string): boolean {
  if (!response || typeof response !== "object") return false;
  const { hash, data } = response as { hash?: unknown; data?: unknown };
  if (typeof hash !== "string" || !data || typeof data !== "object") return false;
  return [false, true].some((esc) => createHash("sha256").update(helcimJson(data, esc) + secretToken).digest("hex") === hash.toLowerCase());
}

export interface RefundInput {
  /** The sale being refunded. */
  originalTransactionId: string;
  amountCents: number;
  idempotencyKey: string;
  ipAddress: string;
}

export interface RefundResult {
  status: "approved" | "declined" | "other";
  transactionId: string | null;
  raw: unknown;
}

/**
 * Refunds part or all of a card sale. Field names and the same-day void rules are confirmed on test day.
 * Throws HelcimError: status 0 or 5xx means the answer is unknown (check Helcim before retrying), 4xx means Helcim refused.
 */
export async function refundTransaction(auth: HelcimAuth, input: RefundInput, fetchImpl: Fetch = fetch): Promise<RefundResult> {
  const id = /^\d+$/.test(input.originalTransactionId) ? Number(input.originalTransactionId) : input.originalTransactionId;
  let res: Response;
  try {
    res = await fetchImpl(`${BASE}/payment/refund`, {
      method: "POST",
      headers: headers(auth, { "content-type": "application/json", "idempotency-key": input.idempotencyKey }),
      body: JSON.stringify({ originalTransactionId: id, amount: Number((input.amountCents / 100).toFixed(2)), ipAddress: input.ipAddress, ecommerce: false }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HelcimError("No answer from Helcim", 0, false);
  }
  if (!res.ok) throw new HelcimError(`Helcim refused the refund (${res.status})`, res.status, false);
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const st = String(j.status ?? "").toUpperCase();
  return { status: st === "APPROVED" ? "approved" : st === "DECLINED" ? "declined" : "other", transactionId: j.transactionId == null ? null : String(j.transactionId), raw: j };
}
