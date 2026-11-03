import "server-only";
import { and, desc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { appointments, auditLog, memberships, timeOff, user } from "@evergreen/db";
import { addDays, HOLDING_STATUSES, isManager, parseHm, ymd, zonedToUtc } from "@evergreen/core";
import { db } from "../db";
import { auditRow } from "../audit";
import { sendEmail } from "../email";
import { actorOf, canManageStaff, ForbiddenError, requireManager, type Ctx } from "./ctx";
import { loadMembers } from "./workspace";

export type TimeOffRow = typeof timeOff.$inferSelect & { name: string; color: string };

const requestInput = z
  .object({
    membershipId: z.uuid().optional(),
    startDay: ymd,
    endDay: ymd,
    allDay: z.coerce.boolean().default(true),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    reason: z.string().trim().max(500).optional().transform((v) => v || null),
  })
  .refine((v) => v.endDay >= v.startDay, { message: "The last day must be on or after the first day." });

/** Works out the real start and end instants of a request in the business time zone. */
function instants(tz: string, v: z.infer<typeof requestInput>) {
  if (v.allDay) {
    return { startsAt: zonedToUtc(v.startDay, 0, tz), endsAt: zonedToUtc(addDays(v.endDay, 1), 0, tz) };
  }
  const s = parseHm(v.startTime ?? "");
  const e = parseHm(v.endTime ?? "");
  if (s == null || e == null) throw new Error("Add a start and end time, or choose all day.");
  const startsAt = zonedToUtc(v.startDay, s, tz);
  const endsAt = zonedToUtc(v.endDay, e, tz);
  if (endsAt <= startsAt) throw new Error("The end time must be after the start time.");
  return { startsAt, endsAt };
}

/**
 * Request time off. A team member asks for themselves. A manager can enter it for
 * anyone, and their own entries for other people are approved right away.
 */
export async function requestTimeOff(ctx: Ctx, raw: unknown) {
  const v = requestInput.parse(raw);
  const membershipId = v.membershipId ?? ctx.membershipId;
  if (!canManageStaff(ctx, membershipId)) throw new ForbiddenError("You can only request time off for yourself.");
  const members = await loadMembers(ctx.workspace.id);
  const who = members.find((m) => m.membershipId === membershipId);
  if (!who) throw new Error("That person is not on this team.");
  const { startsAt, endsAt } = instants(ctx.workspace.timezone, v);
  const autoApprove = isManager(ctx.role) && membershipId !== ctx.membershipId;

  const d = db();
  const [row] = await d
    .insert(timeOff)
    .values({
      workspaceId: ctx.workspace.id,
      membershipId,
      startsAt,
      endsAt,
      allDay: v.allDay,
      startDay: v.startDay,
      endDay: v.endDay,
      reason: v.reason,
      status: autoApprove ? "approved" : "pending",
      reviewedBy: autoApprove ? ctx.userId : null,
      reviewedAt: autoApprove ? new Date() : null,
    })
    .returning();
  await d.insert(auditLog).values(auditRow(actorOf(ctx), "time_off", row.id, autoApprove ? "created_approved" : "requested", undefined, { startDay: v.startDay, endDay: v.endDay }));

  if (!autoApprove) {
    // Let managers know there is something to review.
    const managers = members.filter((m) => isManager(m.role) && m.membershipId !== membershipId);
    await Promise.all(
      managers.map((m) =>
        sendEmail({
          to: m.email,
          subject: `${who.name} requested time off`,
          text: `${who.name} asked for time off ${v.startDay === v.endDay ? `on ${v.startDay}` : `from ${v.startDay} to ${v.endDay}`}.${v.reason ? `\n\nNote: ${v.reason}` : ""}\n\nReview it on the Time off page in ${ctx.workspace.name}.`,
        }),
      ),
    );
  }
  const conflicts = await conflictsFor(ctx.workspace.id, membershipId, startsAt, endsAt);
  const warn = conflicts.length ? ` Heads up: ${conflicts.length} booked appointment${conflicts.length === 1 ? "" : "s"} in that time.` : "";
  return { message: (autoApprove ? "Time off added." : "Request sent for approval.") + warn, id: row.id };
}

/** Booked appointments that fall inside a stretch of time off. */
export async function conflictsFor(workspaceId: string, membershipId: string, startsAt: Date, endsAt: Date) {
  return db()
    .select({ id: appointments.id, startsAt: appointments.startsAt, serviceName: appointments.serviceName })
    .from(appointments)
    .where(
      and(
        eq(appointments.workspaceId, workspaceId),
        eq(appointments.membershipId, membershipId),
        isNull(appointments.deletedAt),
        inArray(appointments.status, HOLDING_STATUSES),
        lt(appointments.startsAt, endsAt),
        gt(appointments.endsAt, startsAt),
      ),
    );
}

const reviewInput = z.object({ id: z.uuid(), decision: z.enum(["approved", "denied"]), note: z.string().trim().max(500).optional() });

export async function reviewTimeOff(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const { id, decision, note } = reviewInput.parse(raw);
  const [row] = await db().select().from(timeOff).where(and(eq(timeOff.id, id), eq(timeOff.workspaceId, ctx.workspace.id), isNull(timeOff.deletedAt)));
  if (!row) throw new Error("That request was not found.");
  if (row.membershipId === ctx.membershipId && ctx.role !== "owner") throw new ForbiddenError("Someone else needs to review your own request.");
  if (row.status !== "pending" && row.status !== "approved") throw new Error("That request was already closed.");
  const d = db();
  await d.batch([
    d.update(timeOff).set({ status: decision, reviewedBy: ctx.userId, reviewedAt: new Date(), reviewNote: note || null }).where(eq(timeOff.id, id)),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "time_off", id, decision, { status: row.status }, { status: decision, note })),
  ]);
  const [person] = await db().select({ email: user.email, name: user.name }).from(memberships).innerJoin(user, eq(user.id, memberships.userId)).where(eq(memberships.id, row.membershipId));
  if (person) {
    await sendEmail({
      to: person.email,
      subject: `Time off ${decision}`,
      text: `Hi ${person.name.split(" ")[0]},\n\nYour time off ${row.startDay === row.endDay ? `on ${row.startDay}` : `from ${row.startDay} to ${row.endDay}`} was ${decision} by ${ctx.name}.${note ? `\n\nNote: ${note}` : ""}\n\n${ctx.workspace.name}`,
    });
  }
  const conflicts = decision === "approved" ? await conflictsFor(ctx.workspace.id, row.membershipId, row.startsAt, row.endsAt) : [];
  return {
    message:
      decision === "approved"
        ? `Approved.${conflicts.length ? ` ${conflicts.length} booked appointment${conflicts.length === 1 ? " needs" : "s need"} to be moved.` : ""}`
        : "Denied.",
  };
}

export async function cancelTimeOff(ctx: Ctx, raw: unknown) {
  const { id } = z.object({ id: z.uuid() }).parse(raw);
  const [row] = await db().select().from(timeOff).where(and(eq(timeOff.id, id), eq(timeOff.workspaceId, ctx.workspace.id), isNull(timeOff.deletedAt)));
  if (!row) throw new Error("That request was not found.");
  if (!canManageStaff(ctx, row.membershipId)) throw new ForbiddenError("You can only cancel your own requests.");
  if (!isManager(ctx.role) && row.status === "approved" && row.startsAt < new Date()) throw new Error("Time off that already started can only be changed by a manager.");
  const d = db();
  await d.batch([
    d.update(timeOff).set({ status: "cancelled" }).where(eq(timeOff.id, id)),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "time_off", id, "cancelled", { status: row.status }, { status: "cancelled" })),
  ]);
  return { message: "Time off cancelled." };
}

/** Requests visible to this person: managers see everyone's, team members their own. */
export async function listTimeOff(ctx: Ctx, opts: { scope: "open" | "past" }) {
  const now = new Date();
  const rows = await db()
    .select({ t: timeOff, name: user.name, color: memberships.color })
    .from(timeOff)
    .innerJoin(memberships, eq(memberships.id, timeOff.membershipId))
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(
      and(
        eq(timeOff.workspaceId, ctx.workspace.id),
        isNull(timeOff.deletedAt),
        ...(isManager(ctx.role) ? [] : [eq(timeOff.membershipId, ctx.membershipId)]),
        opts.scope === "open"
          ? or(eq(timeOff.status, "pending"), and(eq(timeOff.status, "approved"), gt(timeOff.endsAt, now)))
          : or(lt(timeOff.endsAt, now), inArray(timeOff.status, ["denied", "cancelled"])),
      ),
    )
    .orderBy(opts.scope === "open" ? timeOff.startsAt : desc(timeOff.startsAt))
    .limit(opts.scope === "open" ? 200 : 50);
  return rows.map((r) => ({ ...r.t, name: r.name, color: r.color })) as TimeOffRow[];
}

/** Approved time off overlapping a stretch, for the calendar and availability. */
export async function approvedTimeOff(workspaceId: string, from: Date, to: Date, membershipIds?: string[]) {
  return db()
    .select()
    .from(timeOff)
    .where(
      and(
        eq(timeOff.workspaceId, workspaceId),
        isNull(timeOff.deletedAt),
        eq(timeOff.status, "approved"),
        lt(timeOff.startsAt, to),
        gt(timeOff.endsAt, from),
        ...(membershipIds ? [inArray(timeOff.membershipId, membershipIds.length ? membershipIds : ["00000000-0000-0000-0000-000000000000"])] : []),
      ),
    );
}
