import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { account, auditLog, invites, memberships, session, user, workspaces } from "@evergreen/db";
import { ROLES, type Role } from "@evergreen/core";
import { db } from "../db";
import { auditRow } from "../audit";
import { sendEmail } from "../email";
import { appUrl } from "../platform";
import { siteConfig } from "../site-config";
import { hashToken, newToken } from "../tokens";
import { actorOf, requireManager, requireRole, type Ctx } from "./ctx";
import { addMember, loadMembers } from "./workspace";

const INVITE_DAYS = 14;

const tempPasswordInput = z.object({
  userId: z.string().min(1),
  password: z.string().min(10, "Use at least 10 characters.").max(128),
});

/**
 * Owner sets a temporary password for a teammate who is locked out (works without email).
 * Signs that person out everywhere. They log in with it and can change it with Forgot password later.
 */
export async function setTemporaryPassword(ctx: Ctx, raw: unknown) {
  requireRole(ctx, ["owner"]);
  const { userId, password } = tempPasswordInput.parse(raw);
  const members = await loadMembers(ctx.workspace.id);
  const m = members.find((x) => x.id === userId);
  if (!m) throw new Error("That person is not on this team.");
  // A person on several teams: only an owner of every one of them should be able to do this.
  const theirs = await db().select({ ws: memberships.workspaceId }).from(memberships).where(and(eq(memberships.userId, userId), isNull(memberships.deletedAt)));
  if (theirs.length > 1) throw new Error(`${m.name} is on more than one team. Ask them to use Forgot password instead.`);
  const hash = await hashPassword(password);
  const updated = await db()
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .returning({ id: account.id });
  if (!updated.length) throw new Error(`${m.name} has not created a password yet.`);
  await db().delete(session).where(eq(session.userId, userId));
  await db().insert(auditLog).values(auditRow(actorOf(ctx), "member", m.membershipId, "temporary_password"));
  return { message: `Temporary password set for ${m.name}. Send it to them privately.` };
}

const inviteInput = z.object({
  email: z.email("Check the email").trim().toLowerCase(),
  role: z.enum(ROLES).default("member"),
  title: z.string().trim().max(60).optional().transform((v) => v || null),
});

/** Creates an invite and emails the link. Returns the link too, so it can be sent another way when email is not set up. */
export async function issueInvite(workspaceId: string, raw: unknown, invitedBy: string | null) {
  const { email, role, title } = inviteInput.parse(raw);
  const [ws] = await db().select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("Business not found.");

  const already = await db()
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.workspaceId, workspaceId), eq(user.email, email), isNull(memberships.deletedAt)))
    .limit(1);
  if (already.length) throw new Error(`${email} is already on the team.`);

  const token = newToken();
  const d = db();
  // One live invite per email: older ones stop working.
  await d.batch([
    d.update(invites).set({ deletedAt: new Date() }).where(and(eq(invites.workspaceId, workspaceId), eq(invites.email, email), isNull(invites.acceptedAt), isNull(invites.deletedAt))),
    d.insert(invites).values({
      workspaceId,
      email,
      role,
      title,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
      invitedBy,
    }),
  ]);
  const link = `${appUrl()}/join?token=${token}`;
  const sent = await sendEmail({
    to: email,
    subject: `You're invited to ${ws.name} on ${siteConfig.businessName}`,
    text: `Hi,\n\nYou've been invited to join ${ws.name} on ${siteConfig.businessName}, where you can see your schedule, clock in and out, and request time off.\n\nSet up your login here (the link works for ${INVITE_DAYS} days):\n${link}\n\n${siteConfig.businessName}`,
  });
  return { link, sent };
}

export async function createInvite(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const parsed = inviteInput.parse(raw);
  if (parsed.role === "owner" && ctx.role !== "owner") throw new Error("Only an owner can invite another owner.");
  const { link, sent } = await issueInvite(ctx.workspace.id, parsed, ctx.userId);
  return {
    message: sent ? `Invite sent to ${parsed.email}.` : `Invite created. Email is not set up, so copy the link and send it to ${parsed.email}.`,
    data: sent ? undefined : link,
  };
}

export async function revokeInvite(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const { id } = z.object({ id: z.uuid() }).parse(raw);
  await db().update(invites).set({ deletedAt: new Date() }).where(and(eq(invites.id, id), eq(invites.workspaceId, ctx.workspace.id)));
  return { message: "Invite cancelled." };
}

/** Looks up a live invite by its secret. */
export async function findInvite(token: string) {
  if (!token || token.length > 100) return null;
  const [row] = await db()
    .select({ invite: invites, wsName: workspaces.name })
    .from(invites)
    .innerJoin(workspaces, eq(workspaces.id, invites.workspaceId))
    .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.acceptedAt), isNull(invites.deletedAt), gt(invites.expiresAt, new Date()), isNull(workspaces.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Joins the signed-in user to the invite's business. The invite email must match the login email. */
export async function acceptInvite(token: string, userId: string, email: string) {
  const found = await findInvite(token);
  if (!found) throw new Error("This invite has expired or was already used. Ask for a new one.");
  if (found.invite.email !== email.toLowerCase()) throw new Error(`This invite is for ${found.invite.email}. Log in with that email to accept it.`);
  const membershipId = await addMember(found.invite.workspaceId, userId, found.invite.role, found.invite.title);
  const d = db();
  await d.batch([
    d.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, found.invite.id)),
    d.insert(auditLog).values(auditRow({ workspaceId: found.invite.workspaceId, userId, label: email }, "member", membershipId, "joined", undefined, { role: found.invite.role })),
  ]);
  return { workspaceId: found.invite.workspaceId, workspaceName: found.wsName };
}

const memberInput = z.object({
  membershipId: z.uuid(),
  role: z.enum(ROLES).optional(),
  title: z.string().trim().max(60).optional().transform((v) => (v === undefined ? undefined : v || null)),
  bio: z.string().trim().max(600).optional().transform((v) => (v === undefined ? undefined : v || null)),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  bookable: z.boolean().optional(),
  bookableOnline: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export async function updateMember(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const input = memberInput.parse(raw);
  const [m] = await db().select().from(memberships).where(and(eq(memberships.id, input.membershipId), eq(memberships.workspaceId, ctx.workspace.id), isNull(memberships.deletedAt)));
  if (!m) throw new Error("That person is not on this team.");
  if (input.role && input.role !== m.role) {
    if (ctx.role !== "owner") throw new Error("Only an owner can change roles.");
    if (m.role === "owner" && input.role !== "owner") await mustKeepAnOwner(ctx.workspace.id, m.id);
  }
  const { membershipId, ...patch } = input;
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<typeof memberships.$inferInsert>;
  const d = db();
  await d.batch([
    d.update(memberships).set(clean).where(eq(memberships.id, membershipId)),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "member", membershipId, "updated", pick(m, Object.keys(clean)), clean)),
  ]);
  return { message: "Saved." };
}

export async function removeMember(ctx: Ctx, raw: unknown) {
  requireRole(ctx, ["owner"]);
  const { membershipId } = z.object({ membershipId: z.uuid() }).parse(raw);
  if (membershipId === ctx.membershipId) throw new Error("You cannot remove yourself.");
  const [m] = await db().select().from(memberships).where(and(eq(memberships.id, membershipId), eq(memberships.workspaceId, ctx.workspace.id), isNull(memberships.deletedAt)));
  if (!m) throw new Error("That person is not on this team.");
  if (m.role === "owner") await mustKeepAnOwner(ctx.workspace.id, m.id);
  const d = db();
  // Soft remove: their past appointments and timesheets stay intact.
  await d.batch([
    d.update(memberships).set({ deletedAt: new Date(), bookable: false }).where(eq(memberships.id, membershipId)),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "member", membershipId, "removed")),
  ]);
  return { message: "Removed from the team. Their history is kept." };
}

async function mustKeepAnOwner(workspaceId: string, leavingId: string) {
  const owners = await db()
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, "owner" as Role), isNull(memberships.deletedAt)));
  if (owners.filter((o) => o.id !== leavingId).length === 0) throw new Error("A business needs at least one owner.");
}

function pick<T extends object>(o: T, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, (o as Record<string, unknown>)[k]]));
}
