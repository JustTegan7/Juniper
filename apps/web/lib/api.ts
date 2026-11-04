import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "./auth";
import { ConflictError } from "./services/appointments";
import { ctxForUser, ForbiddenError, NotFoundError, type Ctx } from "./services/ctx";

/**
 * Phone API (/api/v1) plumbing. Route handlers stay thin: resolve ctx, call one service, shape JSON.
 * No business rules live here; they stay in lib/services.
 */

/** The business the phone wants to act in. Checked against the person's memberships on every request. */
export const WORKSPACE_HEADER = "x-juniper-workspace";

export type ApiErrorCode = "unauthorized" | "no_workspace" | "forbidden" | "not_found" | "conflict" | "invalid" | "unsupported_media_type" | "server_error";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Signed-in session from a bearer token (phone) or session cookie, or a 401. */
export async function apiSession(req: Request) {
  const session = await auth().api.getSession({ headers: req.headers });
  if (!session) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  return session;
}

/**
 * Same ctx the web app builds, with the active business taken from the workspace header instead
 * of the cookie. Asking for a business you are not on is a 403, never a silent fallback.
 */
export async function apiCtx(req: Request, wanted = req.headers.get(WORKSPACE_HEADER)): Promise<Ctx> {
  const session = await apiSession(req);
  const ctx = await ctxForUser(session.user, wanted, { strict: true });
  if (ctx === "no-workspace") throw new ApiError(403, "no_workspace", "You are not on a team yet. Ask your business for an invite.");
  if (ctx === "not-a-member") throw new ApiError(403, "forbidden", "You are not on that team.");
  return ctx;
}

/** JSON body for writes. Requiring application/json also means a browser cannot send it cross-site without a CORS preflight. */
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "unsupported_media_type", "Send JSON with Content-Type: application/json.");
  }
  try {
    const body: unknown = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new ApiError(400, "invalid", "The request body must be a JSON object.");
}

function errorResponse(status: number, code: ApiErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Maps service errors to HTTP. Plain `Error`s from services are user-facing messages (400); anything else is a 500 with a generic message. */
export function toErrorResponse(e: unknown) {
  if (e instanceof ApiError) return errorResponse(e.status, e.code, e.message);
  if (e instanceof ZodError) return errorResponse(400, "invalid", e.issues[0]?.message ?? "Check the request.");
  if (e instanceof ForbiddenError) return errorResponse(403, "forbidden", e.message);
  if (e instanceof NotFoundError) return errorResponse(404, "not_found", e.message);
  if (e instanceof ConflictError) return errorResponse(409, "conflict", e.message);
  if (e instanceof Error && Object.getPrototypeOf(e) === Error.prototype) return errorResponse(400, "invalid", e.message);
  console.error(e);
  return errorResponse(500, "server_error", "Something went wrong.");
}

/** Wraps a handler: success is `{ data }` with no-store, failures are `{ error: { code, message } }`. */
export async function respond<T>(fn: () => Promise<T>, status = 200) {
  try {
    const data = await fn();
    return NextResponse.json({ data }, { status, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** What the phone needs to know about the signed-in person and the active business. */
export function mePayload(ctx: Ctx) {
  const ws = ctx.workspace;
  return {
    user: { id: ctx.userId, name: ctx.name, email: ctx.email },
    role: ctx.role,
    membershipId: ctx.membershipId,
    today: ctx.today,
    isPlatformAdmin: ctx.isPlatformAdmin,
    workspace: {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      timezone: ws.timezone,
      brandColor: ws.brandColor,
      vocab: ws.vocab,
      trackRestBreaks: ws.settings.time.trackRestBreaks,
    },
    workspaces: ctx.workspaces,
  };
}

type ClockStatus = Awaited<ReturnType<typeof import("./services/timeclock").clockStatus>>;

export function clockPayload(s: ClockStatus) {
  const brk = (b: ClockStatus["breaks"][number]) => ({ id: b.id, kind: b.kind, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt?.toISOString() ?? null });
  return {
    clockedIn: Boolean(s.entry),
    entry: s.entry ? { id: s.entry.id, clockIn: s.entry.clockIn.toISOString() } : null,
    breaks: s.breaks.map(brk),
    openBreak: s.openBreak ? brk(s.openBreak) : null,
  };
}
