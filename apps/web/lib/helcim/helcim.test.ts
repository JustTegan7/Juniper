import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decryptSecret, encryptSecret } from "./crypto";
import { getCardTransaction, HelcimError, newIdempotencyKey, startPurchase } from "./client";
import { verifyHelcimSignature } from "./signature";

const KEY = randomBytes(32).toString("base64");

describe("crypto", () => {
  it("round trips and never stores the plain text", () => {
    const stored = encryptSecret("api-token-123", KEY);
    expect(stored).not.toContain("api-token-123");
    expect(stored.startsWith("v1.")).toBe(true);
    expect(decryptSecret(stored, KEY)).toBe("api-token-123");
  });
  it("uses a fresh iv each time", () => {
    expect(encryptSecret("same", KEY)).not.toBe(encryptSecret("same", KEY));
  });
  it("rejects the wrong key and tampered values", () => {
    const stored = encryptSecret("secret", KEY);
    expect(() => decryptSecret(stored, randomBytes(32).toString("base64"))).toThrow();
    const parts = stored.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), KEY)).toThrow();
  });
  it("refuses a missing or short key", () => {
    expect(() => encryptSecret("x", undefined)).toThrow(/not set/);
    expect(() => encryptSecret("x", Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("webhook signature", () => {
  const verifier = randomBytes(24).toString("base64");
  const now = new Date("2026-11-13T22:00:00Z");
  const ts = String(Math.floor(now.getTime() / 1000));
  const body = '{"id":"25764674","type":"cardTransaction"}';
  const sign = (id: string, t: string, b: string) => createHmac("sha256", Buffer.from(verifier, "base64")).update(`${id}.${t}.${b}`).digest("base64");
  const ok = { id: "msg_1", timestamp: ts, signature: `v1,${sign("msg_1", ts, body)}` };

  it("accepts a valid signature", () => {
    expect(verifyHelcimSignature({ headers: ok, body, verifierToken: verifier, now })).toEqual({ ok: true });
  });
  it("accepts when one of several signatures matches", () => {
    const headers = { ...ok, signature: `v1,AAAA v1,${sign("msg_1", ts, body)}` };
    expect(verifyHelcimSignature({ headers, body, verifierToken: verifier, now }).ok).toBe(true);
  });
  it("rejects a changed body", () => {
    const r = verifyHelcimSignature({ headers: ok, body: body.replace("25764674", "1"), verifierToken: verifier, now });
    expect(r).toEqual({ ok: false, reason: "bad_signature" });
  });
  it("rejects the wrong verifier token", () => {
    const r = verifyHelcimSignature({ headers: ok, body, verifierToken: randomBytes(24).toString("base64"), now });
    expect(r.ok).toBe(false);
  });
  it("rejects stale and future timestamps", () => {
    const old = String(Math.floor(now.getTime() / 1000) - 600);
    const stale = { id: "msg_1", timestamp: old, signature: `v1,${sign("msg_1", old, body)}` };
    expect(verifyHelcimSignature({ headers: stale, body, verifierToken: verifier, now })).toEqual({ ok: false, reason: "stale" });
    const future = String(Math.floor(now.getTime() / 1000) + 600);
    expect(verifyHelcimSignature({ headers: { ...stale, timestamp: future }, body, verifierToken: verifier, now }).ok).toBe(false);
  });
  it("rejects missing headers and junk timestamps", () => {
    expect(verifyHelcimSignature({ headers: { id: null, timestamp: ts, signature: "v1,x" }, body, verifierToken: verifier, now })).toEqual({ ok: false, reason: "missing_headers" });
    expect(verifyHelcimSignature({ headers: { ...ok, timestamp: "abc" }, body, verifierToken: verifier, now })).toEqual({ ok: false, reason: "bad_timestamp" });
  });
});

describe("helcim client", () => {
  const auth = { apiToken: "merchant-token", partnerToken: "partner-token" };
  const input = { deviceCode: "FD4Y", amountCents: 1250, currency: "USD", invoiceNumber: "1042", idempotencyKey: newIdempotencyKey() };

  it("makes 25 character alphanumeric idempotency keys", () => {
    const k = newIdempotencyKey();
    expect(k).toMatch(/^[A-Za-z0-9]{25}$/);
    expect(newIdempotencyKey()).not.toBe(k);
  });

  it("sends the purchase with the partner token, idempotency key and invoice number", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 202 }));
    await startPurchase(auth, input, f as unknown as typeof fetch);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.helcim.com/v2/devices/FD4Y/payment/purchase");
    const h = init.headers as Record<string, string>;
    expect(h["api-token"]).toBe("merchant-token");
    expect(h["partner-token"]).toBe("partner-token");
    expect(h["idempotency-key"]).toBe(input.idempotencyKey);
    expect(JSON.parse(init.body as string)).toEqual({ currency: "USD", transactionAmount: 12.5, invoiceNumber: "1042" });
  });

  it("omits the partner token when none is set", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 202 }));
    await startPurchase({ apiToken: "t" }, input, f as unknown as typeof fetch);
    const h = (f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect("partner-token" in h).toBe(false);
  });

  it.each([
    [404, true],
    [409, true],
    [403, true],
    [500, false],
  ])("status %i maps to notSent=%s", async (status, notSent) => {
    const f = vi.fn(async () => new Response("{}", { status }));
    const err = await startPurchase(auth, input, f as unknown as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(HelcimError);
    expect(err.notSent).toBe(notSent);
    expect(err.message.length).toBeGreaterThan(10);
  });

  it("treats a network failure as unknown, not as not sent", async () => {
    const f = vi.fn(async () => {
      throw new Error("boom");
    });
    const err = await startPurchase(auth, input, f as unknown as typeof fetch).catch((e) => e);
    expect(err.notSent).toBe(false);
    expect(err.status).toBe(0);
  });

  it("reads a transaction and converts dollars to cents", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ transactionId: 77, status: "APPROVED", amount: 12.5, invoiceNumber: "1042", deviceCode: "FD4Y" }), { status: 200 }));
    const t = await getCardTransaction(auth, "77", f as unknown as typeof fetch);
    expect(t).toMatchObject({ status: "approved", amountCents: 1250, invoiceNumber: "1042", deviceCode: "FD4Y" });
  });

  it("marks anything not approved or declined as other, and fails on lookup errors", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ status: "PENDING" }), { status: 200 }));
    expect((await getCardTransaction(auth, "1", f as unknown as typeof fetch)).status).toBe("other");
    const bad = vi.fn(async () => new Response("{}", { status: 500 }));
    await expect(getCardTransaction(auth, "1", bad as unknown as typeof fetch)).rejects.toBeInstanceOf(HelcimError);
  });
});
