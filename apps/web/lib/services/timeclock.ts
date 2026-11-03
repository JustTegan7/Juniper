import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { auditLog, timeBreaks, timeEntries } from "@evergreen/db";
import {
  addDays,
  buildTimesheet,
  decimalHours,
  FLAG_LABELS,
  formatTimeIn,
  isManager,
  parseHm,
  weekStart,
  ymd,
  zonedToUtc,
  type Punch,
  type Timesheet,
  type TimeRules,
} from "@evergreen/core";
import { batch, db } from "../db";
import { auditRow } from "../audit";
import { actorOf, ForbiddenError, requireManager, type Ctx } from "./ctx";
import { loadMembers, type Member } from "./workspace";

function rulesOf(ctx: Ctx): TimeRules {
  const t = ctx.workspace.settings.time;
  return {
    weeklyOvertimeAfter: t.weeklyOvertimeAfter,
    weekStartsOn: t.weekStartsOn,
    mealRequiredAfter: t.mealRequiredAfter,
    mealMinMinutes: t.mealMinMinutes,
    mealStartBy: t.mealStartBy,
    mealUnpaid: t.mealUnpaid,
    trackRestBreaks: t.trackRestBreaks,
  };
}

function isUniqueError(e: unknown) {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    const c = cur as { code?: string; cause?: unknown };
    if (c.code === "23505") return true;
    cur = c.cause;
  }
  return false;
}

/** The open shift (and open break) for a person, if any. */
export async function clockStatus(ctx: Ctx, membershipId = ctx.membershipId) {
  const [entry] = await db()
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.workspaceId, ctx.workspace.id), eq(timeEntries.membershipId, membershipId), isNull(timeEntries.clockOut), isNull(timeEntries.deletedAt)))
    .limit(1);
  if (!entry) return { entry: null, breaks: [], openBreak: null };
  const breaks = await db().select().from(timeBreaks).where(and(eq(timeBreaks.entryId, entry.id), isNull(timeBreaks.deletedAt))).orderBy(asc(timeBreaks.startsAt));
  return { entry, breaks, openBreak: breaks.find((b) => !b.endsAt) ?? null };
}

export async function clockIn(ctx: Ctx) {
  try {
    await db().insert(timeEntries).values({ workspaceId: ctx.workspace.id, membershipId: ctx.membershipId, clockIn: new Date() });
  } catch (e) {
    if (isUniqueError(e)) throw new Error("You are already clocked in.");
    throw e;
  }
  return { message: `Clocked in at ${formatTimeIn(new Date(), ctx.workspace.timezone)}.` };
}

export async function clockOut(ctx: Ctx) {
  const { entry, openBreak } = await clockStatus(ctx);
  if (!entry) throw new Error("You are not clocked in.");
  const now = new Date();
  const d = db();
  await batch([
    ...(openBreak ? [d.update(timeBreaks).set({ endsAt: now }).where(eq(timeBreaks.id, openBreak.id))] : []),
    d.update(timeEntries).set({ clockOut: now }).where(eq(timeEntries.id, entry.id)),
  ]);
  return { message: `Clocked out at ${formatTimeIn(now, ctx.workspace.timezone)}.` };
}

export async function startBreak(ctx: Ctx, raw: unknown) {
  const { kind } = z.object({ kind: z.enum(["meal", "rest"]) }).parse(raw);
  const { entry, openBreak } = await clockStatus(ctx);
  if (!entry) throw new Error("Clock in first.");
  if (openBreak) throw new Error("You are already on a break.");
  try {
    await db().insert(timeBreaks).values({ workspaceId: ctx.workspace.id, entryId: entry.id, kind, startsAt: new Date() });
  } catch (e) {
    if (isUniqueError(e)) throw new Error("You are already on a break.");
    throw e;
  }
  return { message: kind === "meal" ? "Meal break started. Enjoy." : "Rest break started." };
}

export async function endBreak(ctx: Ctx) {
  const { openBreak } = await clockStatus(ctx);
  if (!openBreak) throw new Error("You are not on a break.");
  await db().update(timeBreaks).set({ endsAt: new Date() }).where(eq(timeBreaks.id, openBreak.id));
  return { message: "Welcome back." };
}

const opt = z.string().optional().transform((v) => (v ? v : null));
const entryInput = z.object({
  id: z.uuid().optional(),
  membershipId: z.uuid(),
  day: ymd,
  clockIn: z.string(),
  clockOut: opt,
  mealStart: opt,
  mealEnd: opt,
  note: z.string().trim().max(500).optional().transform((v) => v || null),
});

/** A wall time on the shift's day, rolling past midnight when it is earlier than the shift start. */
function onShift(day: string, hm: string, tz: string, after?: Date) {
  const m = parseHm(hm);
  if (m == null) throw new Error("Check the times.");
  let at = zonedToUtc(day, m, tz);
  if (after && at < after) at = zonedToUtc(addDays(day, 1), m, tz);
  return at;
}

/** Managers add or fix a shift. Every change is kept in the audit log with the old times. */
export async function saveEntry(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const v = entryInput.parse(raw);
  const members = await loadMembers(ctx.workspace.id);
  if (!members.some((m) => m.membershipId === v.membershipId)) throw new Error("That person is not on this team.");
  const tz = ctx.workspace.timezone;
  const inAt = onShift(v.day, v.clockIn, tz);
  const outAt = v.clockOut ? onShift(v.day, v.clockOut, tz, inAt) : null;
  let meal: { start: Date; end: Date } | null = null;
  if (v.mealStart || v.mealEnd) {
    if (!v.mealStart || !v.mealEnd) throw new Error("Add both meal break times, or leave both blank.");
    const start = onShift(v.day, v.mealStart, tz, inAt);
    const end = onShift(v.day, v.mealEnd, tz, start);
    if (start < inAt || (outAt && end > outAt)) throw new Error("The meal break must be inside the shift.");
    meal = { start, end };
  }
  const now = new Date();
  const d = db();
  if (v.id) {
    const [before] = await d.select().from(timeEntries).where(and(eq(timeEntries.id, v.id), eq(timeEntries.workspaceId, ctx.workspace.id), isNull(timeEntries.deletedAt)));
    if (!before) throw new Error("That shift was not found.");
    const oldBreaks = await d.select().from(timeBreaks).where(and(eq(timeBreaks.entryId, v.id), isNull(timeBreaks.deletedAt)));
    const oldMeal = oldBreaks.find((b) => b.kind === "meal");
    await batch([
      d.update(timeEntries).set({ membershipId: v.membershipId, clockIn: inAt, clockOut: outAt, note: v.note, editedBy: ctx.userId, editedAt: now }).where(eq(timeEntries.id, v.id)),
      // The form edits the first meal break. Rest breaks stay as punched.
      ...(oldMeal ? [d.update(timeBreaks).set({ deletedAt: now }).where(eq(timeBreaks.id, oldMeal.id))] : []),
      ...(meal ? [d.insert(timeBreaks).values({ workspaceId: ctx.workspace.id, entryId: v.id, kind: "meal" as const, startsAt: meal.start, endsAt: meal.end })] : []),
      d.insert(auditLog).values(
        auditRow(actorOf(ctx), "time_entry", v.id, "edited", { clockIn: before.clockIn, clockOut: before.clockOut, meal: oldMeal ? [oldMeal.startsAt, oldMeal.endsAt] : null }, { clockIn: inAt, clockOut: outAt, meal: meal ? [meal.start, meal.end] : null, note: v.note }),
      ),
    ]);
    return { message: "Shift updated." };
  }
  const [row] = await d.insert(timeEntries).values({ workspaceId: ctx.workspace.id, membershipId: v.membershipId, clockIn: inAt, clockOut: outAt, note: v.note, editedBy: ctx.userId, editedAt: now }).returning({ id: timeEntries.id });
  await batch([
    ...(meal ? [d.insert(timeBreaks).values({ workspaceId: ctx.workspace.id, entryId: row.id, kind: "meal" as const, startsAt: meal.start, endsAt: meal.end })] : []),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "time_entry", row.id, "added", undefined, { clockIn: inAt, clockOut: outAt, note: v.note })),
  ]);
  return { message: "Shift added." };
}

export async function deleteEntry(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const { id } = z.object({ id: z.uuid() }).parse(raw);
  const [before] = await db().select().from(timeEntries).where(and(eq(timeEntries.id, id), eq(timeEntries.workspaceId, ctx.workspace.id), isNull(timeEntries.deletedAt)));
  if (!before) throw new Error("That shift was not found.");
  const d = db();
  await d.batch([
    d.update(timeEntries).set({ deletedAt: new Date(), editedBy: ctx.userId, editedAt: new Date() }).where(eq(timeEntries.id, id)),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "time_entry", id, "deleted", { clockIn: before.clockIn, clockOut: before.clockOut })),
  ]);
  return { message: "Shift removed." };
}

export interface MemberTimesheet {
  member: Member;
  sheet: Timesheet;
  entries: Record<string, { note: string | null; edited: boolean; meal: { start: string; end: string | null } | null }>;
}

/** Timesheets for a pay period. Managers see everyone; team members see their own. */
export async function loadTimesheets(ctx: Ctx, start: string, end: string, only?: string): Promise<MemberTimesheet[]> {
  const tz = ctx.workspace.timezone;
  const rules = rulesOf(ctx);
  let members = await loadMembers(ctx.workspace.id);
  if (!isManager(ctx.role)) members = members.filter((m) => m.membershipId === ctx.membershipId);
  else if (only) members = members.filter((m) => m.membershipId === only);
  if (!members.length) return [];
  if (!isManager(ctx.role) && only && only !== ctx.membershipId) throw new ForbiddenError("You can only see your own timesheet.");

  const from = zonedToUtc(weekStart(start, rules.weekStartsOn), 0, tz);
  const to = zonedToUtc(addDays(end, 1), 0, tz);
  const ids = members.map((m) => m.membershipId);
  const entries = await db()
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.workspaceId, ctx.workspace.id), inArray(timeEntries.membershipId, ids), isNull(timeEntries.deletedAt), gte(timeEntries.clockIn, from), lt(timeEntries.clockIn, to)))
    .orderBy(asc(timeEntries.clockIn));
  const breaks = entries.length
    ? await db().select().from(timeBreaks).where(and(inArray(timeBreaks.entryId, entries.map((e) => e.id)), isNull(timeBreaks.deletedAt)))
    : [];
  const now = Date.now();
  return members.map((member) => {
    const mine = entries.filter((e) => e.membershipId === member.membershipId);
    const punches: Punch[] = mine.map((e) => ({
      id: e.id,
      clockIn: e.clockIn.getTime(),
      clockOut: e.clockOut?.getTime() ?? null,
      breaks: breaks.filter((b) => b.entryId === e.id).map((b) => ({ start: b.startsAt.getTime(), end: b.endsAt?.getTime() ?? null, kind: b.kind })),
    }));
    return {
      member,
      sheet: buildTimesheet(punches, { start, end, timeZone: tz, now, rules }),
      entries: Object.fromEntries(
        mine.map((e) => {
          const meal = breaks.filter((b) => b.entryId === e.id && b.kind === "meal").sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
          return [e.id, { note: e.note, edited: Boolean(e.editedAt), meal: meal ? { start: meal.startsAt.toISOString(), end: meal.endsAt?.toISOString() ?? null } : null }];
        }),
      ),
    };
  });
}

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Payroll export. "summary" is one row per person; "detail" is one row per shift. */
export async function timesheetCsv(ctx: Ctx, start: string, end: string, mode: "summary" | "detail") {
  requireManager(ctx);
  const sheets = await loadTimesheets(ctx, start, end);
  const tz = ctx.workspace.timezone;
  const rows: (string | number)[][] = [];
  if (mode === "summary") {
    rows.push(["Employee", "Email", "Title", "Period start", "Period end", "Worked hours", "Regular hours", "Overtime hours", "Items to review"]);
    for (const s of sheets) {
      rows.push([s.member.name, s.member.email, s.member.title ?? "", start, end, decimalHours(s.sheet.workedMinutes), decimalHours(s.sheet.regularMinutes), decimalHours(s.sheet.overtimeMinutes), s.sheet.flagCount]);
    }
  } else {
    rows.push(["Employee", "Email", "Date", "Clock in", "Clock out", "Meal minutes", "Rest minutes", "Worked hours", "Day regular hours", "Day overtime hours", "Notes", "Flags"]);
    for (const s of sheets) {
      for (const day of s.sheet.days) {
        day.punches.forEach((p, i) => {
          rows.push([
            s.member.name,
            s.member.email,
            day.day,
            formatTimeIn(new Date(p.clockIn), tz),
            p.clockOut ? formatTimeIn(new Date(p.clockOut), tz) : "",
            p.mealMinutes,
            p.restMinutes,
            decimalHours(p.workedMinutes),
            i === 0 ? decimalHours(day.regularMinutes) : "",
            i === 0 ? decimalHours(day.overtimeMinutes) : "",
            s.entries[p.id]?.note ?? "",
            p.flags.map((f) => FLAG_LABELS[f]).join("; "),
          ]);
        });
      }
    }
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
