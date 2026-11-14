import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLog, conversationMembers, conversations, memberships, messages, user } from "@evergreen/db";
import { isManager } from "@evergreen/core";
import { batch, db } from "../db";
import { auditRow } from "../audit";
import { actorOf, ForbiddenError, NotFoundError, type Ctx } from "./ctx";
import { sendPush } from "./push";
import { newMessageText } from "./push-messages";

/** Team chat. See docs/team-chat-spec.md. Staff only; every read checks the person is in the conversation. */

export const MESSAGE_MAX = 4000;
const PAGE = 100;

export interface ConversationRow {
  id: string;
  kind: "group" | "direct";
  /** Group name, or the other person's name for a direct message. */
  title: string;
  memberCount: number;
  lastMessageAt: Date;
  lastPreview: string | null;
  unread: number;
  muted: boolean;
}

export interface MessageRow {
  id: string;
  parentId: string | null;
  senderMembershipId: string | null;
  senderName: string;
  body: string;
  createdAt: Date;
  deleted: boolean;
  replyCount: number;
}

async function requireMember(ctx: Ctx, conversationId: string) {
  const d = db();
  const [row] = await d
    .select({ conv: conversations, member: conversationMembers })
    .from(conversations)
    .innerJoin(conversationMembers, eq(conversationMembers.conversationId, conversations.id))
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.workspaceId, ctx.workspace.id),
        isNull(conversations.deletedAt),
        eq(conversationMembers.membershipId, ctx.membershipId),
        isNull(conversationMembers.deletedAt),
      ),
    );
  if (!row) throw new NotFoundError("That conversation was not found.");
  return row;
}

async function activeTeamIds(workspaceId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db()
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), inArray(memberships.id, ids), isNull(memberships.deletedAt)));
  return rows.map((r) => r.id);
}

/** Conversations this person is in, newest first, with unread counts. */
export async function listConversations(ctx: Ctx): Promise<ConversationRow[]> {
  const d = db();
  const mine = await d
    .select({ conv: conversations, member: conversationMembers })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(
        eq(conversationMembers.membershipId, ctx.membershipId),
        isNull(conversationMembers.deletedAt),
        eq(conversations.workspaceId, ctx.workspace.id),
        isNull(conversations.deletedAt),
      ),
    )
    .orderBy(desc(conversations.lastMessageAt));
  if (!mine.length) return [];
  const ids = mine.map((m) => m.conv.id);

  const people = await d
    .select({ conversationId: conversationMembers.conversationId, membershipId: conversationMembers.membershipId, name: user.name })
    .from(conversationMembers)
    .innerJoin(memberships, eq(memberships.id, conversationMembers.membershipId))
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(inArray(conversationMembers.conversationId, ids), isNull(conversationMembers.deletedAt)));

  const lastRead = new Map(mine.map((m) => [m.conv.id, m.member.lastReadAt]));
  const msgs = await d
    .select({ conversationId: messages.conversationId, body: messages.body, createdAt: messages.createdAt, sender: messages.senderMembershipId })
    .from(messages)
    .where(and(inArray(messages.conversationId, ids), isNull(messages.deletedAt)))
    .orderBy(desc(messages.createdAt));
  const preview = new Map<string, string>();
  const unread = new Map<string, number>();
  for (const m of msgs) {
    if (!preview.has(m.conversationId)) preview.set(m.conversationId, m.body.slice(0, 80));
    if (m.sender !== ctx.membershipId && m.createdAt > (lastRead.get(m.conversationId) ?? new Date(0))) {
      unread.set(m.conversationId, (unread.get(m.conversationId) ?? 0) + 1);
    }
  }

  return mine.map(({ conv, member }) => {
    const others = people.filter((p) => p.conversationId === conv.id);
    const other = others.find((p) => p.membershipId !== ctx.membershipId);
    return {
      id: conv.id,
      kind: conv.kind,
      title: conv.kind === "direct" ? (other?.name ?? "Former teammate") : (conv.title ?? "Group"),
      memberCount: others.length,
      lastMessageAt: conv.lastMessageAt,
      lastPreview: preview.get(conv.id) ?? null,
      unread: unread.get(conv.id) ?? 0,
      muted: member.muted,
    };
  });
}

/** Total unread across conversations that are not muted. For the nav badge, so it is one query. */
export async function unreadTotal(ctx: Ctx): Promise<number> {
  const res = await db().execute(sql`
    select count(*)::int as n from messages m
    join conversation_members cm on cm.conversation_id = m.conversation_id
    join conversations c on c.id = m.conversation_id
    where cm.membership_id = ${ctx.membershipId} and cm.deleted_at is null and cm.muted = false
      and c.workspace_id = ${ctx.workspace.id} and c.deleted_at is null
      and m.deleted_at is null and m.created_at > cm.last_read_at
      and m.sender_membership_id is distinct from ${ctx.membershipId}`);
  return Number((res.rows as { n: number }[])[0]?.n ?? 0);
}

const directInput = z.object({ membershipId: z.uuid() });

/** Opens the direct message with someone, creating it the first time. */
export async function startDirect(ctx: Ctx, raw: unknown) {
  const { membershipId } = directInput.parse(raw);
  if (membershipId === ctx.membershipId) throw new Error("Pick someone else on your team.");
  const [ok] = await activeTeamIds(ctx.workspace.id, [membershipId]);
  if (!ok) throw new Error("That person is not on this team.");
  const d = db();

  const existing = await d.execute(sql`
    select c.id from conversations c
    where c.workspace_id = ${ctx.workspace.id} and c.kind = 'direct' and c.deleted_at is null
      and exists (select 1 from conversation_members a where a.conversation_id = c.id and a.membership_id = ${ctx.membershipId})
      and exists (select 1 from conversation_members b where b.conversation_id = c.id and b.membership_id = ${membershipId})
    limit 1`);
  const found = (existing.rows as { id: string }[])[0];
  if (found) {
    // Bring either side back if they had left.
    await d
      .update(conversationMembers)
      .set({ deletedAt: null })
      .where(and(eq(conversationMembers.conversationId, found.id), inArray(conversationMembers.membershipId, [ctx.membershipId, membershipId])));
    return { message: "Opened.", id: found.id };
  }

  const [conv] = await d
    .insert(conversations)
    .values({ workspaceId: ctx.workspace.id, kind: "direct", createdByMembershipId: ctx.membershipId })
    .returning({ id: conversations.id });
  await batch([
    d.insert(conversationMembers).values([
      { workspaceId: ctx.workspace.id, conversationId: conv!.id, membershipId: ctx.membershipId },
      { workspaceId: ctx.workspace.id, conversationId: conv!.id, membershipId },
    ]),
  ]);
  return { message: "Opened.", id: conv!.id };
}

const groupInput = z.object({
  title: z.string().trim().min(1, "Give the group a name.").max(80),
  membershipIds: z.array(z.uuid()).max(100).default([]),
});

export async function createGroup(ctx: Ctx, raw: unknown) {
  const v = groupInput.parse(raw);
  const ids = await activeTeamIds(ctx.workspace.id, [...new Set(v.membershipIds)].filter((x) => x !== ctx.membershipId));
  const d = db();
  const [conv] = await d
    .insert(conversations)
    .values({ workspaceId: ctx.workspace.id, kind: "group", title: v.title, createdByMembershipId: ctx.membershipId })
    .returning({ id: conversations.id });
  await batch([
    d.insert(conversationMembers).values([ctx.membershipId, ...ids].map((membershipId) => ({ workspaceId: ctx.workspace.id, conversationId: conv!.id, membershipId }))),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "conversation", conv!.id, "created", undefined, { title: v.title, members: ids.length + 1 })),
  ]);
  return { message: "Group created.", id: conv!.id };
}

const membersInput = z.object({ conversationId: z.uuid(), membershipIds: z.array(z.uuid()).min(1).max(100) });

function canManageGroup(ctx: Ctx, createdBy: string | null) {
  return isManager(ctx.role) || createdBy === ctx.membershipId;
}

export async function addGroupMembers(ctx: Ctx, raw: unknown) {
  const v = membersInput.parse(raw);
  const { conv } = await requireMember(ctx, v.conversationId);
  if (conv.kind !== "group") throw new Error("You can only add people to a group.");
  if (!canManageGroup(ctx, conv.createdByMembershipId)) throw new ForbiddenError("Only the person who made the group, or a manager, can add people.");
  const ids = await activeTeamIds(ctx.workspace.id, [...new Set(v.membershipIds)]);
  const d = db();
  for (const membershipId of ids) {
    const [row] = await d
      .select({ id: conversationMembers.id })
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, conv.id), eq(conversationMembers.membershipId, membershipId)));
    if (row) await d.update(conversationMembers).set({ deletedAt: null, lastReadAt: new Date() }).where(eq(conversationMembers.id, row.id));
    else await d.insert(conversationMembers).values({ workspaceId: ctx.workspace.id, conversationId: conv.id, membershipId });
  }
  await d.insert(auditLog).values(auditRow(actorOf(ctx), "conversation", conv.id, "members_added", undefined, { membershipIds: ids }));
  return { message: "People added." };
}

/** Leave a group yourself, or (creator or manager) remove someone. */
export async function removeGroupMember(ctx: Ctx, raw: unknown) {
  const v = z.object({ conversationId: z.uuid(), membershipId: z.uuid() }).parse(raw);
  const { conv } = await requireMember(ctx, v.conversationId);
  if (conv.kind !== "group") throw new Error("You can only leave a group.");
  if (v.membershipId !== ctx.membershipId && !canManageGroup(ctx, conv.createdByMembershipId)) {
    throw new ForbiddenError("Only the person who made the group, or a manager, can remove people.");
  }
  const d = db();
  await batch([
    d
      .update(conversationMembers)
      .set({ deletedAt: new Date() })
      .where(and(eq(conversationMembers.conversationId, conv.id), eq(conversationMembers.membershipId, v.membershipId))),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "conversation", conv.id, v.membershipId === ctx.membershipId ? "left" : "member_removed", undefined, { membershipId: v.membershipId })),
  ]);
  return { message: v.membershipId === ctx.membershipId ? "You left the group." : "Removed from the group." };
}

export async function listGroupMembers(ctx: Ctx, raw: unknown) {
  const { conversationId } = z.object({ conversationId: z.uuid() }).parse(raw);
  await requireMember(ctx, conversationId);
  return db()
    .select({ membershipId: conversationMembers.membershipId, name: user.name })
    .from(conversationMembers)
    .innerJoin(memberships, eq(memberships.id, conversationMembers.membershipId))
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(conversationMembers.conversationId, conversationId), isNull(conversationMembers.deletedAt)))
    .orderBy(asc(user.name));
}

const listInput = z.object({ conversationId: z.uuid(), parentId: z.uuid().optional() });

async function toRows(ctx: Ctx, rows: (typeof messages.$inferSelect)[]): Promise<MessageRow[]> {
  const d = db();
  const senderIds = [...new Set(rows.map((r) => r.senderMembershipId).filter((x): x is string => !!x))];
  const names = senderIds.length
    ? await d
        .select({ id: memberships.id, name: user.name })
        .from(memberships)
        .innerJoin(user, eq(user.id, memberships.userId))
        .where(and(eq(memberships.workspaceId, ctx.workspace.id), inArray(memberships.id, senderIds)))
    : [];
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  const parentIds = rows.filter((r) => !r.parentId).map((r) => r.id);
  const counts = parentIds.length
    ? await d
        .select({ parentId: messages.parentId, n: sql<number>`count(*)::int` })
        .from(messages)
        .where(and(inArray(messages.parentId, parentIds), isNull(messages.deletedAt)))
        .groupBy(messages.parentId)
    : [];
  const replyCount = new Map(counts.map((c) => [c.parentId, c.n]));
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parentId,
    senderMembershipId: r.senderMembershipId,
    senderName: r.senderMembershipId ? (nameOf.get(r.senderMembershipId) ?? "Former teammate") : "Former teammate",
    // A deleted message keeps its place (and its replies) but not its words.
    body: r.deletedAt ? "" : r.body,
    createdAt: r.createdAt,
    deleted: !!r.deletedAt,
    replyCount: replyCount.get(r.id) ?? 0,
  }));
}

/**
 * Top level messages of a conversation, oldest first (the latest 100), or with parentId the replies
 * in that thread. Deleted top level messages are kept as a placeholder when they have replies.
 */
export async function listMessages(ctx: Ctx, raw: unknown): Promise<MessageRow[]> {
  const v = listInput.parse(raw);
  await requireMember(ctx, v.conversationId);
  const d = db();
  if (v.parentId) {
    const rows = await d
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, v.conversationId), eq(messages.parentId, v.parentId), isNull(messages.deletedAt)))
      .orderBy(asc(messages.createdAt))
      .limit(PAGE);
    return toRows(ctx, rows);
  }
  const latest = await d
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, v.conversationId), isNull(messages.parentId)))
    .orderBy(desc(messages.createdAt))
    .limit(PAGE);
  const out = await toRows(ctx, latest.reverse());
  return out.filter((m) => !m.deleted || m.replyCount > 0);
}

const sendInput = z.object({
  conversationId: z.uuid(),
  body: z.string().trim().min(1, "Write a message first.").max(MESSAGE_MAX, `Messages can be up to ${MESSAGE_MAX} characters.`),
  parentId: z.uuid().optional(),
});

export async function sendMessage(ctx: Ctx, raw: unknown) {
  const v = sendInput.parse(raw);
  const { conv } = await requireMember(ctx, v.conversationId);
  const d = db();
  if (v.parentId) {
    const [parent] = await d
      .select({ id: messages.id, parentId: messages.parentId })
      .from(messages)
      .where(and(eq(messages.id, v.parentId), eq(messages.conversationId, conv.id), isNull(messages.deletedAt)));
    if (!parent) throw new NotFoundError("That message was not found.");
    if (parent.parentId) throw new Error("You can reply to a message, but not to a reply.");
  }
  const now = new Date();
  const [row] = await d
    .insert(messages)
    .values({ workspaceId: ctx.workspace.id, conversationId: conv.id, senderMembershipId: ctx.membershipId, parentId: v.parentId ?? null, body: v.body })
    .returning({ id: messages.id });
  await batch([
    d.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, conv.id)),
    d.update(conversationMembers).set({ lastReadAt: now }).where(and(eq(conversationMembers.conversationId, conv.id), eq(conversationMembers.membershipId, ctx.membershipId))),
  ]);

  const others = await d
    .select({ membershipId: conversationMembers.membershipId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conv.id), isNull(conversationMembers.deletedAt), eq(conversationMembers.muted, false)));
  const text = newMessageText({ senderName: ctx.name, conversationTitle: conv.kind === "group" ? conv.title : null, isReply: !!v.parentId });
  await sendPush({
    workspaceId: ctx.workspace.id,
    membershipIds: others.map((o) => o.membershipId).filter((id) => id !== ctx.membershipId),
    kind: "messages",
    ...text,
    data: { type: "message", conversationId: conv.id },
  });
  return { message: "Sent.", id: row!.id };
}

export async function markRead(ctx: Ctx, raw: unknown) {
  const { conversationId } = z.object({ conversationId: z.uuid() }).parse(raw);
  await requireMember(ctx, conversationId);
  await db()
    .update(conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.membershipId, ctx.membershipId)));
}

export async function setMuted(ctx: Ctx, raw: unknown) {
  const v = z.object({ conversationId: z.uuid(), muted: z.coerce.boolean() }).parse(raw);
  await requireMember(ctx, v.conversationId);
  await db()
    .update(conversationMembers)
    .set({ muted: v.muted })
    .where(and(eq(conversationMembers.conversationId, v.conversationId), eq(conversationMembers.membershipId, ctx.membershipId)));
  return { message: v.muted ? "Muted." : "Unmuted." };
}

/** Your own message, or any message if you are a manager. The row stays; the words go. */
export async function deleteMessage(ctx: Ctx, raw: unknown) {
  const { id } = z.object({ id: z.uuid() }).parse(raw);
  const d = db();
  const [msg] = await d.select().from(messages).where(and(eq(messages.id, id), eq(messages.workspaceId, ctx.workspace.id), isNull(messages.deletedAt)));
  if (!msg) throw new NotFoundError("That message was not found.");
  await requireMember(ctx, msg.conversationId);
  if (msg.senderMembershipId !== ctx.membershipId && !isManager(ctx.role)) throw new ForbiddenError("You can only delete your own messages.");
  await batch([
    d.update(messages).set({ deletedAt: new Date() }).where(eq(messages.id, id)),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "message", id, "deleted", { senderMembershipId: msg.senderMembershipId, conversationId: msg.conversationId })),
  ]);
  return { message: "Message deleted." };
}
