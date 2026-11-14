import "server-only";
import { ZodError } from "zod";
import { json, corsFor } from "../../../../lib/shop-api";
import { loadBusinessBySlug } from "../../../../lib/services/public";

type Run = (slug: string, req: Request) => Promise<unknown>;

/** Shared wrapper: finds the shop, applies CORS, turns errors into JSON. Public, no login. */
export function shopRoute(run: Run, method: "GET" | "POST") {
  return async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const ws = await loadBusinessBySlug(slug);
    const allowed = ws?.settings.shop.allowedOrigins ?? [];
    const cors = corsFor(allowed, req.headers.get("origin"));
    if (!ws || !ws.settings.shop.enabled || !ws.settings.shop.onlineEnabled) return json({ error: "This shop is not open." }, 404, cors.headers);
    if (!cors.ok) return json({ error: "This website is not allowed to use the shop." }, 403, cors.headers);
    if (method === "POST" && !(req.headers.get("content-type") ?? "").includes("application/json")) return json({ error: "Send JSON." }, 415, cors.headers);
    try {
      return json(await run(slug, req), 200, cors.headers);
    } catch (e) {
      if (e instanceof ZodError) return json({ error: e.issues[0]?.message ?? "Check the request." }, 400, cors.headers);
      if (e instanceof Error) return json({ error: e.message }, 400, cors.headers);
      return json({ error: "Something went wrong." }, 500, cors.headers);
    }
  };
}

/** Preflight. Answers only for allowed origins. */
export async function shopOptions(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ws = await loadBusinessBySlug((await params).slug);
  const cors = corsFor(ws?.settings.shop.allowedOrigins ?? [], req.headers.get("origin"));
  return new Response(null, { status: cors.ok && ws ? 204 : 403, headers: cors.headers });
}
