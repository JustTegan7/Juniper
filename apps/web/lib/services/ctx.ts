import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { memberships, user, workspaces } from "@evergreen/db";
import { isManager, parseSettings, todayIn, vocabularyFor, type Role, type Vocabulary, type WorkspaceSettings } from "@evergreen/core";
import { auth } from "../auth";
import { db } from "../db";
import { isPlatformAdmin } from "../platform";
import type { AuditActor } from "../audit";

export const ACTIVE_WORKSPACE_COOKIE = "jo_ws";

export interface CtxWorkspace {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  template: string;
  brandColor: string;
  settings: WorkspaceSettings;
  vocab: Vocabulary;
}

export interface Ctx {
  userId: string;
  name: string;
  email: string;
  role: Role;
  /** This person's membership in the active workspace (staff id used across scheduling tables). */
  membershipId: string;
  workspace: CtxWorkspace;
  /** Every business this person belongs to, for the switcher. */
  workspaces: { id: string; name: string }[];
  /** YYYY-MM-DD in the user's (or workspace's) time zone. */
  today: string;
  timezone: string;
  isPlatformAdmin: boolean;
}

export class ForbiddenError extends Error {}

/** A record that does not exist in this business (or was deleted). Same message to the user as before; lets the API answer 404. */
export class NotFoundError extends Error {}

export const getSession = cache(async () => {
  const h = await headers();
  return auth().api.getSession({ headers: h });
});

export function toWorkspace(ws: typeof workspaces.$inferSelect): CtxWorkspace {
  const settings = parseSettings(ws.settings);
  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    timezone: ws.timezone,
    template: ws.template,
    brandColor: ws.brandColor,
    settings,
    vocab: vocabularyFor(ws.template, settings.vocabulary),
  };
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Builds ctx for a signed-in person. The one place that decides which business is active,
 * shared by the web app (cookie) and the phone API (header).
 * `wanted` is the business the caller asked for. When `strict` is false (web), an unknown or
 * stale id falls back to the first business. When `strict` is true (API), asking for a business
 * this person is not on returns "not-a-member" instead.
 */
export async function ctxForUser(u: SessionUser, wanted: string | null | undefined, opts: { strict?: boolean } = {}): Promise<Ctx | "no-workspace" | "not-a-member"> {
  const rows = await db()
    .select({ m: memberships, ws: workspaces, tz: user.timezone })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.userId, u.id), isNull(memberships.deletedAt), isNull(workspaces.deletedAt)))
    .orderBy(asc(memberships.createdAt));
  if (!rows.length) return "no-workspace";

  const match = wanted ? rows.find((r) => r.ws.id === wanted) : undefined;
  if (wanted && !match && opts.strict) return "not-a-member";
  const active = match ?? rows[0];
  const ws = toWorkspace(active.ws);
  const tz = active.tz ?? ws.timezone;

  return {
    userId: u.id,
    name: u.name,
    email: u.email,
    role: active.m.role,
    membershipId: active.m.id,
    workspace: ws,
    workspaces: rows.map((r) => ({ id: r.ws.id, name: r.ws.name })),
    today: todayIn(tz, new Date()),
    timezone: ws.timezone,
    isPlatformAdmin: isPlatformAdmin(u.email),
  };
}

async function loadCtx(): Promise<Ctx | "no-workspace" | null> {
  const session = await getSession();
  if (!session) return null;
  const wanted = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const ctx = await ctxForUser(session.user, wanted);
  return ctx === "not-a-member" ? null : ctx;
}

/** The signed-in team member, or a redirect (to /login, or /welcome when they are not on a team). Cached per request. */
export const getCtx = cache(async (): Promise<Ctx> => {
  const ctx = await loadCtx();
  if (!ctx) redirect("/login");
  if (ctx === "no-workspace") redirect("/welcome");
  return ctx;
});

export function requireRole(ctx: Ctx, roles: Role[]) {
  if (!roles.includes(ctx.role)) throw new ForbiddenError("You do not have access to do that.");
}

export function requireManager(ctx: Ctx) {
  if (!isManager(ctx.role)) throw new ForbiddenError("Only owners and managers can do that.");
}

/** Managers see and book for everyone. Team members work on their own column, unless the business turns that off. */
export function canManageStaff(ctx: Ctx, membershipId: string) {
  return isManager(ctx.role) || ctx.membershipId === membershipId;
}

export function actorOf(ctx: Ctx): AuditActor {
  return { workspaceId: ctx.workspace.id, userId: ctx.userId, label: ctx.name };
}
