import "server-only";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { account, auditLog, memberships, pushTokens, session, user, workspaces } from "@evergreen/db";
import { batch, db } from "../db";
import { auditRow } from "../audit";
import { actorOf, type Ctx } from "./ctx";

const input = z.object({ confirm: z.string() });

/**
 * Deletes the signed-in person's login (Apple and Google both require this from the app).
 *
 * Juniper never hard-deletes a person, because their past appointments, timesheets and payroll hours
 * belong to the business and must stay intact. Instead this:
 * - blocks while the person is the only owner of a business that still has other people on it
 *   (they must make someone else an owner first, so the business is never left without one);
 * - removes them from every business (soft remove, same as an owner removing a teammate) and turns
 *   off booking, push and their profile text;
 * - deletes their sessions, password and push tokens;
 * - renames and re-emails the user row so no personal details remain ("Former team member").
 * A business where they were the last person is deactivated; its data is purged on request (see the delete page).
 */
export async function deleteAccount(ctx: Ctx, raw: unknown) {
  const { confirm } = input.parse(raw);
  if (confirm.trim().toLowerCase() !== ctx.email.toLowerCase()) throw new Error("Type your email address exactly to confirm.");

  const mine = await db()
    .select({ m: memberships, wsName: workspaces.name })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(and(eq(memberships.userId, ctx.userId), isNull(memberships.deletedAt)));

  // Work out what happens to each business before changing anything.
  const emptied: string[] = [];
  for (const { m, wsName } of mine) {
    const others = await db()
      .select({ id: memberships.id, role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.workspaceId, m.workspaceId), ne(memberships.userId, ctx.userId), isNull(memberships.deletedAt)));
    if (!others.length) {
      emptied.push(m.workspaceId);
    } else if (m.role === "owner" && !others.some((o) => o.role === "owner")) {
      throw new Error(`You are the only owner of ${wsName}. Make someone else an owner first, then delete your account.`);
    }
  }

  const now = new Date();
  const membershipIds = mine.map(({ m }) => m.id);
  const d = db();
  const writes = [
    ...(membershipIds.length
      ? [
          d
            .update(memberships)
            .set({ deletedAt: now, bookable: false, bookableOnline: false, pushBookings: false, pushTimeOff: false, pushMessages: false, bio: null })
            .where(inArray(memberships.id, membershipIds)),
          d.delete(pushTokens).where(inArray(pushTokens.membershipId, membershipIds)),
          d.insert(auditLog).values(mine.map(({ m }) => auditRow(actorOf(ctx), "member", m.id, "account_deleted"))),
        ]
      : []),
    ...(emptied.length ? [d.update(workspaces).set({ deletedAt: now }).where(inArray(workspaces.id, emptied))] : []),
    d.delete(session).where(eq(session.userId, ctx.userId)),
    d.delete(account).where(eq(account.userId, ctx.userId)),
    d
      .update(user)
      .set({ name: "Former team member", email: `deleted-${ctx.userId}@deleted.invalid`, emailVerified: false, image: null, timezone: null, updatedAt: now })
      .where(eq(user.id, ctx.userId)),
  ];
  await batch(writes);
  return { message: "Your account was deleted." };
}
