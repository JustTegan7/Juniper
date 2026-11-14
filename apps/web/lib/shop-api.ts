import "server-only";
import { normalizeOrigin } from "@evergreen/core";

/**
 * CORS for the public shop API. A browser on an allowed website may call it. Server to server calls
 * (no Origin header) are fine. Any other browser origin is refused.
 */
export function corsFor(allowed: string[], origin: string | null): { ok: boolean; headers: Record<string, string> } {
  const base = { Vary: "Origin", "Cache-Control": "no-store" };
  if (!origin) return { ok: true, headers: base };
  const o = normalizeOrigin(origin);
  const list = new Set(allowed.map((a) => normalizeOrigin(a)).filter((x): x is string => !!x));
  if (!o || !list.has(o)) return { ok: false, headers: base };
  return { ok: true, headers: { ...base, "Access-Control-Allow-Origin": o, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "600" } };
}

export function json(body: unknown, status: number, headers: Record<string, string>) {
  return Response.json(body, { status, headers });
}
