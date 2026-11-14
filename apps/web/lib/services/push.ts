import "server-only";
import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { memberships, pushTokens } from "@evergreen/db";
import { isManager, type Vocabulary } from "@evergreen/core";
import { db } from "../db";
import { getExpoReceipts, sendExpoMessages, type ExpoMessage } from "../expo-push";
import { clientCancelledText, newBookingText, timeOffDecisionText, timeOffRequestedText } from "./push-messages";

export type PushKind = "bookings" | "timeOff" | "messages";

export interface PushInput {
  workspaceId: string;
  /** Who should get it. Callers leave out the person who made the change. */
  membershipIds: string[];
  kind: PushKind;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export const ANDROID_CHANNEL = "default";
const SEND_BATCH = 100;
const RECEIPT_BATCH = 300;
const DEVICE_GONE = "DeviceNotRegistered";

/**
 * Sends a push to phones of the given team members. Never throws: a failed push must not fail a
 * booking or a review. People who turned this kind off get nothing. Tokens Expo says are gone are removed.
 * Returns how many messages Expo accepted (0 on any failure).
 */
export async function sendPush(input: PushInput): Promise<number> {
  try {
    const ids = [...new Set(input.membershipIds)];
    if (!ids.length) return 0;
    const wants =
      input.kind === "bookings" ? memberships.pushBookings : input.kind === "messages" ? memberships.pushMessages : memberships.pushTimeOff;
    const rows = await db()
      .select({ id: pushTokens.id, token: pushTokens.token })
      .from(pushTokens)
      .innerJoin(memberships, eq(memberships.id, pushTokens.membershipId))
      .where(
        and(
          eq(pushTokens.workspaceId, input.workspaceId),
          inArray(pushTokens.membershipId, ids),
          isNull(pushTokens.deletedAt),
          eq(memberships.workspaceId, input.workspaceId),
          isNull(memberships.deletedAt),
          eq(wants, true),
        ),
      );
    let accepted = 0;
    for (let i = 0; i < rows.length; i += SEND_BATCH) {
      const chunk = rows.slice(i, i + SEND_BATCH);
      const messages: ExpoMessage[] = chunk.map((r) => ({
        to: r.token,
        title: input.title,
        body: input.body,
        data: { ...input.data, workspaceId: input.workspaceId },
        sound: "default",
        channelId: ANDROID_CHANNEL,
        priority: "high",
      }));
      const tickets = await sendExpoMessages(messages);
      for (const [j, t] of tickets.entries()) {
        const row = chunk[j];
        if (!row) continue;
        if (t.status === "ok") {
          accepted++;
          if (t.id) await db().update(pushTokens).set({ ticketId: t.id, ticketAt: new Date() }).where(eq(pushTokens.id, row.id));
        } else if (t.details?.error === DEVICE_GONE) {
          await dropToken(row.id);
        }
      }
    }
    return accepted;
  } catch (e) {
    console.warn("push failed", e instanceof Error ? e.message : e);
    return 0;
  }
}

async function dropToken(id: string) {
  await db().update(pushTokens).set({ deletedAt: new Date(), ticketId: null, ticketAt: null, updatedAt: new Date() }).where(eq(pushTokens.id, id));
}

/**
 * Checks Expo receipts for tickets older than 15 minutes and removes tokens that are no longer registered.
 * Runs from the cron at /api/cron/push-receipts. Safe to run more than once. Never throws.
 */
export async function processPushReceipts(now = new Date()): Promise<{ checked: number; removed: number }> {
  let checked = 0;
  let removed = 0;
  try {
    const due = await db()
      .select({ id: pushTokens.id, ticketId: pushTokens.ticketId })
      .from(pushTokens)
      .where(and(isNotNull(pushTokens.ticketId), lt(pushTokens.ticketAt, new Date(now.getTime() - 15 * 60_000))))
      .limit(1000);
    for (let i = 0; i < due.length; i += RECEIPT_BATCH) {
      const chunk = due.slice(i, i + RECEIPT_BATCH);
      const receipts = await getExpoReceipts(chunk.map((r) => r.ticketId!));
      for (const r of chunk) {
        const receipt = receipts[r.ticketId!];
        if (!receipt) continue; // not ready yet, try again next run
        checked++;
        if (receipt.status === "error" && receipt.details?.error === DEVICE_GONE) {
          await dropToken(r.id);
          removed++;
        } else {
          await db().update(pushTokens).set({ ticketId: null, ticketAt: null }).where(eq(pushTokens.id, r.id));
        }
      }
    }
  } catch (e) {
    console.warn("push receipts failed", e instanceof Error ? e.message : e);
  }
  return { checked, removed };
}

/** Owners and managers of a business. */
async function managerIds(workspaceId: string): Promise<string[]> {
  const rows = await db()
    .select({ id: memberships.id, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), isNull(memberships.deletedAt)));
  return rows.filter((r) => isManager(r.role)).map((r) => r.id);
}

interface Ws {
  id: string;
  timezone: string;
  vocab: Vocabulary;
}

interface BookingFacts {
  clientFirstName: string;
  serviceName: string;
  staffMembershipId: string;
  staffName: string;
  startsAt: Date;
  appointmentId: string;
}

/** A client booked online: the person it is booked with, and owners and managers. */
export async function notifyNewBooking(ws: Ws, f: BookingFacts) {
  try {
    const to = [f.staffMembershipId, ...(await managerIds(ws.id))];
    const text = newBookingText(ws.vocab, { ...f, tz: ws.timezone });
    await sendPush({ workspaceId: ws.id, membershipIds: to, kind: "bookings", ...text, data: { type: "booking", appointmentId: f.appointmentId, membershipId: f.staffMembershipId, event: "booked" } });
  } catch (e) {
    console.warn("push failed", e instanceof Error ? e.message : e);
  }
}

/** A client cancelled from their manage link: same people as a new booking. */
export async function notifyClientCancelled(ws: Ws, f: BookingFacts) {
  try {
    const to = [f.staffMembershipId, ...(await managerIds(ws.id))];
    const text = clientCancelledText(ws.vocab, { ...f, tz: ws.timezone });
    await sendPush({ workspaceId: ws.id, membershipIds: to, kind: "bookings", ...text, data: { type: "booking", appointmentId: f.appointmentId, membershipId: f.staffMembershipId, event: "cancelled" } });
  } catch (e) {
    console.warn("push failed", e instanceof Error ? e.message : e);
  }
}

/** Someone asked for time off: owners and managers other than the requester. */
export async function notifyTimeOffRequested(ws: Ws, f: { timeOffId: string; requesterMembershipId: string; requesterName: string; startDay: string; endDay: string }) {
  try {
    const to = (await managerIds(ws.id)).filter((id) => id !== f.requesterMembershipId);
    await sendPush({ workspaceId: ws.id, membershipIds: to, kind: "timeOff", ...timeOffRequestedText({ name: f.requesterName, startDay: f.startDay, endDay: f.endDay }), data: { type: "time_off", timeOffId: f.timeOffId, event: "requested" } });
  } catch (e) {
    console.warn("push failed", e instanceof Error ? e.message : e);
  }
}

/** A request was approved or denied: the requester, unless they made the decision themselves. */
export async function notifyTimeOffDecision(ws: Ws, f: { timeOffId: string; requesterMembershipId: string; reviewerMembershipId: string; decision: "approved" | "denied"; startDay: string; endDay: string }) {
  try {
    if (f.requesterMembershipId === f.reviewerMembershipId) return;
    await sendPush({ workspaceId: ws.id, membershipIds: [f.requesterMembershipId], kind: "timeOff", ...timeOffDecisionText(f), data: { type: "time_off", timeOffId: f.timeOffId, event: f.decision } });
  } catch (e) {
    console.warn("push failed", e instanceof Error ? e.message : e);
  }
}
