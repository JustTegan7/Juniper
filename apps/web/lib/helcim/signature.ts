import { createHmac, timingSafeEqual } from "node:crypto";

// Helcim webhook signature check. Signed content is `${webhook-id}.${webhook-timestamp}.${body}`,
// HMAC-SHA256 with the base64-decoded verifier token, base64 output. The header can carry several
// space separated entries like "v1,<sig> v2,<sig>". Pure on purpose: `now` is passed in.

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export type SignatureResult = { ok: true } | { ok: false; reason: "missing_headers" | "bad_timestamp" | "stale" | "bad_signature" };

export function verifyHelcimSignature(input: { headers: WebhookHeaders; body: string; verifierToken: string; now: Date; toleranceSeconds?: number }): SignatureResult {
  const { id, timestamp, signature } = input.headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing_headers" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad_timestamp" };
  const skew = Math.abs(input.now.getTime() / 1000 - ts);
  if (skew > (input.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS)) return { ok: false, reason: "stale" };

  const expected = createHmac("sha256", Buffer.from(input.verifierToken, "base64")).update(`${id}.${timestamp}.${input.body}`).digest();
  for (const part of signature.split(" ")) {
    const comma = part.indexOf(",");
    if (comma < 0) continue;
    const given = Buffer.from(part.slice(comma + 1), "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true };
  }
  return { ok: false, reason: "bad_signature" };
}
