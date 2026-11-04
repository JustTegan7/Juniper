import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { auditLog, memberships, pushTokens } from "@evergreen/db";
import { db } from "../db";
import { auditRow } from "../audit";
import { actorOf, type Ctx } from "./ctx";

const tokenSchema = z
  .string()
  .trim()
  .regex(/^Expo(nent)?PushToken\[[^\]\s]{8,200}\]$/, "That is not a valid push token.");

const registerInput = z.object({ token: tokenSchema, platform: z.enum(["ios", "android"]) });
const removeInput = z.object({ token: tokenSchema });

/**
 * Register or refresh this phone's push token for the active business. One row per token: if the token
 * was on another business or another person (shared phone, switched business), the row moves here.
 */
export async function registerDevice(ctx: Ctx, raw: unknown) {
  const v = registerInput.parse(raw);
  const now = new Date();
  await db()
    .insert(pushTokens)
    .values({ workspaceId: ctx.workspace.id, membershipId: ctx.membershipId, token: v.token, platform: v.platform, lastSeenAt: now })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { workspaceId: ctx.workspace.id, membershipId: ctx.membershipId, platform: v.platform, lastSeenAt: now, deletedAt: null, ticketId: null, ticketAt: null, updatedAt: now },
    });
  return { message: "Notifications are on for this phone." };
}

/** Stop pushes to this phone for this person in the active business. Safe to call twice. */
export async function removeDevice(ctx: Ctx, raw: unknown) {
  const v = removeInput.parse(raw);
  const now = new Date();
  await db()
    .update(pushTokens)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(pushTokens.token, v.token), eq(pushTokens.workspaceId, ctx.workspace.id), eq(pushTokens.membershipId, ctx.membershipId), isNull(pushTokens.deletedAt)));
  return { message: "Notifications are off for this phone." };
}

export interface NotificationSettings {
  bookings: boolean;
  timeOff: boolean;
}

/** This person's on/off choices for the active business. They follow the person between phones. */
export async function getNotificationSettings(ctx: Ctx): Promise<NotificationSettings> {
  const [row] = await db()
    .select({ bookings: memberships.pushBookings, timeOff: memberships.pushTimeOff })
    .from(memberships)
    .where(and(eq(memberships.id, ctx.membershipId), eq(memberships.workspaceId, ctx.workspace.id), isNull(memberships.deletedAt)));
  return row ?? { bookings: true, timeOff: true };
}

const settingsInput = z
  .object({ bookings: z.boolean().optional(), timeOff: z.boolean().optional() })
  .refine((v) => v.bookings !== undefined || v.timeOff !== undefined, { message: "Choose what to change." });

export async function setNotificationSettings(ctx: Ctx, raw: unknown) {
  const v = settingsInput.parse(raw);
  const before = await getNotificationSettings(ctx);
  const after = { bookings: v.bookings ?? before.bookings, timeOff: v.timeOff ?? before.timeOff };
  const d = db();
  await d.batch([
    d.update(memberships).set({ pushBookings: after.bookings, pushTimeOff: after.timeOff, updatedAt: new Date() }).where(and(eq(memberships.id, ctx.membershipId), eq(memberships.workspaceId, ctx.workspace.id))),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "membership", ctx.membershipId, "push_settings", before, after)),
  ]);
  return after;
}
