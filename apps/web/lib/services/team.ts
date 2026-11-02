import "server-only";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { account, session } from "@evergreen/db";
import { db } from "../db";
import { requireRole, type Ctx } from "./ctx";
import { loadMembers } from "./workspace";

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
  const hash = await hashPassword(password);
  const updated = await db()
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .returning({ id: account.id });
  if (!updated.length) throw new Error(`${m.name} has not created a login yet.`);
  await db().delete(session).where(eq(session.userId, userId));
  return { message: `Temporary password set for ${m.name}. Send it to them privately.` };
}
