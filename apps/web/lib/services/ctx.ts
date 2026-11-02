import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { memberships, user, workspaces } from "@evergreen/db";
import { todayIn, type Role } from "@evergreen/core";
import { auth } from "../auth";
import { db } from "../db";
import { teamAllowlist } from "../team";
import { joinDefaultWorkspace } from "./workspace";

export interface Ctx {
  userId: string;
  name: string;
  email: string;
  role: Role;
  workspace: { id: string; name: string; timezone: string };
  /** YYYY-MM-DD in the user's (or workspace's) time zone. */
  today: string;
}

export class ForbiddenError extends Error {}

async function loadCtx(): Promise<Ctx | null> {
  const h = await headers();
  const session = await auth().api.getSession({ headers: h });
  if (!session) return null;
  const u = session.user;

  const find = () =>
    db()
      .select({ role: memberships.role, ws: workspaces, tz: user.timezone })
      .from(memberships)
      .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
      .innerJoin(user, eq(user.id, memberships.userId))
      .where(and(eq(memberships.userId, u.id), isNull(memberships.deletedAt), isNull(workspaces.deletedAt)))
      .orderBy(asc(memberships.createdAt))
      .limit(1);

  let [m] = await find();
  if (!m && teamAllowlist().has(u.email.toLowerCase())) {
    await joinDefaultWorkspace(u.id, u.email);
    [m] = await find();
  }
  if (!m) return null;

  const tz = m.tz ?? m.ws.timezone;
  return {
    userId: u.id,
    name: u.name,
    email: u.email,
    role: m.role,
    workspace: { id: m.ws.id, name: m.ws.name, timezone: m.ws.timezone },
    today: todayIn(tz, new Date()),
  };
}

/** The signed-in member, or a redirect to /login. Cached per request. */
export const getCtx = cache(async (): Promise<Ctx> => {
  const ctx = await loadCtx();
  if (!ctx) redirect("/login");
  return ctx;
});

export function requireRole(ctx: Ctx, roles: Role[]) {
  if (!roles.includes(ctx.role)) throw new ForbiddenError("You do not have access to do that.");
}

/** One place to decide who can see what. The base lets every member see the whole workspace. */
export function canSeeAll(ctx: Ctx) {
  void ctx;
  return true;
}
