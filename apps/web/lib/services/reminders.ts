import "server-only";
import { and, eq, gte, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { appointments, clients, memberships, user, workspaces } from "@evergreen/db";
import { addDays, todayIn } from "@evergreen/core";
import { db } from "../db";
import { sendReminder } from "../notify";
import { hashToken, newToken } from "../tokens";
import { dayBounds, mailBusiness } from "./appointments";
import { toWorkspace } from "./ctx";

/**
 * Emails every client booked for tomorrow (in each business's own time zone) who
 * has not had a reminder yet. Safe to run more than once a day: sent reminders are
 * marked. Runs from the Vercel cron at /api/cron/reminders.
 */
export async function sendDueReminders(now = new Date()) {
  const all = await db().select().from(workspaces).where(isNull(workspaces.deletedAt));
  let sent = 0;
  let failed = 0;
  for (const row of all) {
    const ws = toWorkspace(row);
    if (!ws.settings.booking.sendReminders) continue;
    const tomorrow = addDays(todayIn(ws.timezone, now), 1);
    const { from, to } = dayBounds(tomorrow, ws.timezone);
    const due = await db()
      .select({ a: appointments, c: clients, staffName: user.name })
      .from(appointments)
      .innerJoin(clients, eq(clients.id, appointments.clientId))
      .innerJoin(memberships, eq(memberships.id, appointments.membershipId))
      .innerJoin(user, eq(user.id, memberships.userId))
      .where(
        and(
          eq(appointments.workspaceId, ws.id),
          isNull(appointments.deletedAt),
          isNull(appointments.reminderSentAt),
          inArray(appointments.status, ["booked", "confirmed"]),
          gte(appointments.startsAt, from),
          lt(appointments.startsAt, to),
          isNotNull(clients.email),
        ),
      )
      .limit(500);
    for (const { a, c, staffName } of due) {
      // A fresh manage link in each reminder.
      const token = newToken();
      const ok = await sendReminder(c.email!, c.firstName, { serviceName: a.serviceName, startsAt: a.startsAt, priceCents: a.priceCents, staffName }, mailBusiness(ws), token);
      if (ok) {
        await db().update(appointments).set({ reminderSentAt: new Date(), manageTokenHash: hashToken(token) }).where(eq(appointments.id, a.id));
        sent++;
      } else failed++;
    }
  }
  return { sent, failed };
}
