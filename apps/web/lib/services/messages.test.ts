import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { memberships, user } from "@evergreen/db";

const pg = new PGlite({ extensions: { btree_gist } });
const testDb = drizzle(pg);

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  db: () => testDb,
  batch: async (items: PromiseLike<unknown>[]) => {
    await pg.exec("BEGIN");
    try {
      const out: unknown[] = [];
      for (const q of items) out.push(await q);
      await pg.exec("COMMIT");
      return out;
    } catch (e) {
      await pg.exec("ROLLBACK");
      throw e;
    }
  },
}));

const { createBusiness } = await import("./workspace");
const svc = await import("./messages");
const { addGroupMembers, createGroup, deleteMessage, listConversations, listMessages, markRead, removeGroupMember, sendMessage, setMuted, startDirect, unreadTotal } = svc;
type Ctx = import("./ctx").Ctx;

async function person(wsId: string, slug: string, name: string, role: Ctx["role"]) {
  const uid = `u-${slug}-${name}`;
  await testDb.insert(user).values({ id: uid, name, email: `${uid}@x.test` });
  const [m] = await testDb.insert(memberships).values({ workspaceId: wsId, userId: uid, role }).returning();
  return { userId: uid, name, email: `${uid}@x.test`, role, membershipId: m!.id, workspace: { id: wsId } } as unknown as Ctx;
}

async function seed(slug: string) {
  const ws = await createBusiness({ name: `Shop ${slug}`, slug });
  const owner = await person(ws.id, slug, "Olive Owner", "owner");
  const ana = await person(ws.id, slug, "Ana Staff", "member");
  const ben = await person(ws.id, slug, "Ben Staff", "member");
  return { ws, owner, ana, ben };
}

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url)) });
});
beforeEach(async () => {
  await pg.exec('TRUNCATE workspaces, "user" CASCADE');
});

describe("direct messages", () => {
  it("opens one conversation per pair, from either side", async () => {
    const { ana, ben } = await seed("c-a");
    const a = await startDirect(ana, { membershipId: ben.membershipId });
    const b = await startDirect(ben, { membershipId: ana.membershipId });
    expect(b.id).toBe(a.id);
    expect((await listConversations(ana))[0]).toMatchObject({ kind: "direct", title: "Ben Staff" });
    expect((await listConversations(ben))[0]).toMatchObject({ title: "Ana Staff" });
  });

  it("rejects yourself and people from another business", async () => {
    const { ana } = await seed("c-b");
    const other = await seed("c-b2");
    await expect(startDirect(ana, { membershipId: ana.membershipId })).rejects.toThrow();
    await expect(startDirect(ana, { membershipId: other.ana.membershipId })).rejects.toThrow(/not on this team/);
  });
});

describe("sending and reading", () => {
  it("counts unread for others, clears on read, and not for the sender", async () => {
    const { ana, ben } = await seed("c-c");
    const { id } = await startDirect(ana, { membershipId: ben.membershipId });
    await sendMessage(ana, { conversationId: id, body: "  hello  " });
    await sendMessage(ana, { conversationId: id, body: "are you in?" });
    expect((await listConversations(ana))[0]!.unread).toBe(0);
    const row = (await listConversations(ben))[0]!;
    expect(row).toMatchObject({ unread: 2, lastPreview: "are you in?" });
    expect(await unreadTotal(ben)).toBe(2);
    await markRead(ben, { conversationId: id });
    expect(await unreadTotal(ben)).toBe(0);
    const msgs = await listMessages(ben, { conversationId: id });
    expect(msgs.map((m) => m.body)).toEqual(["hello", "are you in?"]);
    expect(msgs[0]!.senderName).toBe("Ana Staff");
  });

  it("muted conversations do not add to the badge", async () => {
    const { ana, ben } = await seed("c-d");
    const { id } = await startDirect(ana, { membershipId: ben.membershipId });
    await setMuted(ben, { conversationId: id, muted: true });
    await sendMessage(ana, { conversationId: id, body: "hi" });
    expect((await listConversations(ben))[0]!.unread).toBe(1);
    expect(await unreadTotal(ben)).toBe(0);
  });

  it("rejects empty and oversized messages", async () => {
    const { ana, ben } = await seed("c-e");
    const { id } = await startDirect(ana, { membershipId: ben.membershipId });
    await expect(sendMessage(ana, { conversationId: id, body: "   " })).rejects.toThrow();
    await expect(sendMessage(ana, { conversationId: id, body: "x".repeat(4001) })).rejects.toThrow();
  });

  it("keeps outsiders out of a conversation", async () => {
    const { ana, ben, owner } = await seed("c-f");
    const { id } = await startDirect(ana, { membershipId: ben.membershipId });
    await sendMessage(ana, { conversationId: id, body: "private" });
    await expect(listMessages(owner, { conversationId: id })).rejects.toThrow(/not found/);
    await expect(sendMessage(owner, { conversationId: id, body: "hi" })).rejects.toThrow(/not found/);
    const other = await seed("c-f2");
    await expect(listMessages(other.owner, { conversationId: id })).rejects.toThrow(/not found/);
  });
});

describe("threads", () => {
  it("replies hang off a top level message and show a count", async () => {
    const { ana, ben } = await seed("c-g");
    const { id } = await startDirect(ana, { membershipId: ben.membershipId });
    const top = await sendMessage(ana, { conversationId: id, body: "who opens Friday?" });
    await sendMessage(ben, { conversationId: id, body: "me", parentId: top.id });
    await sendMessage(ana, { conversationId: id, body: "thanks", parentId: top.id });
    const main = await listMessages(ben, { conversationId: id });
    expect(main).toHaveLength(1);
    expect(main[0]).toMatchObject({ body: "who opens Friday?", replyCount: 2 });
    const thread = await listMessages(ben, { conversationId: id, parentId: top.id });
    expect(thread.map((m) => m.body)).toEqual(["me", "thanks"]);
  });

  it("does not allow a reply to a reply", async () => {
    const { ana, ben } = await seed("c-h");
    const { id } = await startDirect(ana, { membershipId: ben.membershipId });
    const top = await sendMessage(ana, { conversationId: id, body: "a" });
    const reply = await sendMessage(ben, { conversationId: id, body: "b", parentId: top.id });
    await expect(sendMessage(ana, { conversationId: id, body: "c", parentId: reply.id })).rejects.toThrow(/not to a reply/);
  });
});

describe("groups", () => {
  it("creates with members, adds, and lets people leave", async () => {
    const { owner, ana, ben } = await seed("c-i");
    const { id } = await createGroup(ana, { title: "Front desk", membershipIds: [ben.membershipId] });
    expect((await listConversations(ben))[0]).toMatchObject({ kind: "group", title: "Front desk", memberCount: 2 });
    expect(await listConversations(owner)).toHaveLength(0);
    await addGroupMembers(ana, { conversationId: id, membershipIds: [owner.membershipId] });
    expect((await listConversations(owner))[0]!.memberCount).toBe(3);
    await removeGroupMember(ben, { conversationId: id, membershipId: ben.membershipId });
    expect(await listConversations(ben)).toHaveLength(0);
    await expect(listMessages(ben, { conversationId: id })).rejects.toThrow(/not found/);
  });

  it("only the creator or a manager changes who is in", async () => {
    const { owner, ana, ben } = await seed("c-j");
    const { id } = await createGroup(ana, { title: "Crew", membershipIds: [ben.membershipId, owner.membershipId] });
    await expect(addGroupMembers(ben, { conversationId: id, membershipIds: [ana.membershipId] })).rejects.toThrow(/Only the person/);
    await expect(removeGroupMember(ben, { conversationId: id, membershipId: ana.membershipId })).rejects.toThrow(/Only the person/);
    await removeGroupMember(owner, { conversationId: id, membershipId: ben.membershipId });
    expect(await listConversations(ben)).toHaveLength(0);
  });

  it("needs a name", async () => {
    const { ana } = await seed("c-k");
    await expect(createGroup(ana, { title: "  ", membershipIds: [] })).rejects.toThrow();
  });
});

describe("deleting", () => {
  it("lets you delete your own, not someone else's, and managers delete any", async () => {
    const { owner, ana, ben } = await seed("c-l");
    const { id } = await createGroup(ana, { title: "Crew", membershipIds: [ben.membershipId, owner.membershipId] });
    const m1 = await sendMessage(ana, { conversationId: id, body: "oops" });
    await expect(deleteMessage(ben, { id: m1.id })).rejects.toThrow(/your own/);
    await deleteMessage(ana, { id: m1.id });
    const m2 = await sendMessage(ben, { conversationId: id, body: "rude" });
    await deleteMessage(owner, { id: m2.id });
    expect(await listMessages(ben, { conversationId: id })).toHaveLength(0);
  });

  it("keeps a placeholder for a deleted message that has replies", async () => {
    const { ana, ben } = await seed("c-m");
    const { id } = await startDirect(ana, { membershipId: ben.membershipId });
    const top = await sendMessage(ana, { conversationId: id, body: "secret" });
    await sendMessage(ben, { conversationId: id, body: "ok", parentId: top.id });
    await deleteMessage(ana, { id: top.id });
    const main = await listMessages(ben, { conversationId: id });
    expect(main[0]).toMatchObject({ deleted: true, body: "", replyCount: 1 });
  });
});
