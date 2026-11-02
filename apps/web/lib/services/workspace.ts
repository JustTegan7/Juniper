import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { memberships, user, workspaces } from "@evergreen/db";
import type { Role } from "@evergreen/core";
import { db } from "../db";
import { teamAllowlist } from "../team";

const MEMBER_COLORS = ["#4FB39C", "#E8B33A", "#7FC28A", "#C8643C", "#6C8CD5", "#B07CC6"];

/** Creates a workspace. Apps seed their own defaults (services, stages, settings) after this. */
export async function createWorkspace(name: string, template = "default") {
  const [ws] = await db().insert(workspaces).values({ name, template }).returning();
  return ws;
}

/**
 * The base runs one workspace. New team members join it with the role from
 * APP_TEAM. Creates the workspace on the first sign-up.
 */
export async function joinDefaultWorkspace(userId: string, email: string) {
  const role = teamAllowlist().get(email.toLowerCase()) ?? "member";
  let [ws] = await db().select().from(workspaces).where(isNull(workspaces.deletedAt)).orderBy(asc(workspaces.createdAt)).limit(1);
  if (!ws) ws = await createWorkspace(process.env.APP_WORKSPACE_NAME ?? "My business");
  const existing = await db().select({ id: memberships.id }).from(memberships).where(eq(memberships.workspaceId, ws.id));
  await db()
    .insert(memberships)
    .values({ workspaceId: ws.id, userId, role, color: MEMBER_COLORS[existing.length % MEMBER_COLORS.length] })
    .onConflictDoNothing();
  return ws;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  color: string;
}

export async function loadMembers(workspaceId: string): Promise<Member[]> {
  const rows = await db()
    .select({ id: user.id, name: user.name, email: user.email, role: memberships.role, color: memberships.color })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.workspaceId, workspaceId), isNull(memberships.deletedAt)))
    .orderBy(asc(memberships.createdAt));
  return rows;
}
