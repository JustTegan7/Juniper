// Time clock math for W-2 staff. Pure, tested.
//
// Defaults follow Washington State rules as commonly applied (overtime after 40 hours
// in a fixed 7 day workweek, a 30 minute unpaid meal period for shifts over 5 hours
// that starts no later than the 5th hour, a paid 10 minute rest break per 4 hours).
// The flags help a manager review a timesheet. They are not legal advice, and each
// business can change the numbers in its settings.

import { addDays, diffDays, type Ymd } from "./dates";
import { utcToZoned, weekdayOf } from "./zoned";

export type BreakKind = "meal" | "rest";

export interface PunchBreak {
  start: number;
  end: number | null;
  kind: BreakKind;
}

export interface Punch {
  id: string;
  clockIn: number;
  clockOut: number | null;
  breaks: PunchBreak[];
}

export interface TimeRules {
  /** Overtime after this many minutes in one workweek. */
  weeklyOvertimeAfter: number;
  /** Workweek starts on this weekday (0 Sunday). */
  weekStartsOn: number;
  /** A meal break is due when a shift runs longer than this many minutes. */
  mealRequiredAfter: number;
  /** Shortest meal break that counts. */
  mealMinMinutes: number;
  /** The meal break must start by this many minutes into the shift. */
  mealStartBy: number;
  /** Meal breaks are unpaid (subtracted from worked time). Rest breaks are always paid. */
  mealUnpaid: boolean;
  /** Flag shifts with fewer recorded rest breaks than expected. */
  trackRestBreaks: boolean;
}

export const WA_TIME_RULES: TimeRules = {
  weeklyOvertimeAfter: 40 * 60,
  weekStartsOn: 0,
  mealRequiredAfter: 5 * 60,
  mealMinMinutes: 30,
  mealStartBy: 5 * 60,
  mealUnpaid: true,
  trackRestBreaks: false,
};

export type PunchFlag = "open" | "missed_meal" | "short_meal" | "late_meal" | "missed_rest" | "open_break";

export interface PunchSummary {
  id: string;
  day: Ymd;
  clockIn: number;
  clockOut: number | null;
  /** Clock in to clock out (or `now` while open), minutes. */
  spanMinutes: number;
  mealMinutes: number;
  restMinutes: number;
  /** Paid minutes. */
  workedMinutes: number;
  flags: PunchFlag[];
}

const mins = (ms: number) => Math.max(0, Math.round(ms / 60_000));

export function summarizePunch(p: Punch, timeZone: string, now: number, rules: TimeRules = WA_TIME_RULES): PunchSummary {
  const end = p.clockOut ?? now;
  const span = mins(end - p.clockIn);
  const flags: PunchFlag[] = [];
  if (p.clockOut == null) flags.push("open");

  let meal = 0;
  let rest = 0;
  let firstLongMealStart: number | null = null;
  for (const b of p.breaks) {
    if (b.end == null) flags.push("open_break");
    const bEnd = Math.min(b.end ?? now, end);
    const len = mins(bEnd - Math.max(b.start, p.clockIn));
    if (b.kind === "meal") {
      meal += len;
      if (len >= rules.mealMinMinutes && (firstLongMealStart == null || b.start < firstLongMealStart)) firstLongMealStart = b.start;
    } else rest += len;
  }

  const worked = Math.max(0, span - (rules.mealUnpaid ? meal : 0));

  if (p.clockOut != null && span > rules.mealRequiredAfter) {
    if (meal === 0) flags.push("missed_meal");
    else if (firstLongMealStart == null) flags.push("short_meal");
    else if (mins(firstLongMealStart - p.clockIn) > rules.mealStartBy) flags.push("late_meal");
  }
  if (rules.trackRestBreaks && p.clockOut != null) {
    const expected = Math.floor(worked / 240);
    const recorded = p.breaks.filter((b) => b.kind === "rest" && b.end != null).length;
    if (recorded < expected) flags.push("missed_rest");
  }

  return {
    id: p.id,
    day: utcToZoned(new Date(p.clockIn), timeZone).day,
    clockIn: p.clockIn,
    clockOut: p.clockOut,
    spanMinutes: span,
    mealMinutes: meal,
    restMinutes: rest,
    workedMinutes: worked,
    flags,
  };
}

/** First day of the workweek that contains `day`. */
export function weekStart(day: Ymd, weekStartsOn: number): Ymd {
  const back = (weekdayOf(day) - weekStartsOn + 7) % 7;
  return addDays(day, -back);
}

export interface TimesheetDay {
  day: Ymd;
  punches: PunchSummary[];
  workedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
}

export interface Timesheet {
  start: Ymd;
  end: Ymd;
  days: TimesheetDay[];
  workedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  flagCount: number;
}

/**
 * One person's timesheet for a pay period (start and end inclusive). Pass every
 * punch from the first workweek that touches the period through the end so overtime
 * that crosses a period boundary lands on the right day.
 */
export function buildTimesheet(
  punches: Punch[],
  opts: { start: Ymd; end: Ymd; timeZone: string; now: number; rules?: TimeRules },
): Timesheet {
  const rules = opts.rules ?? WA_TIME_RULES;
  const summaries = punches.map((p) => summarizePunch(p, opts.timeZone, opts.now, rules)).sort((a, b) => a.clockIn - b.clockIn);

  const byDay = new Map<Ymd, PunchSummary[]>();
  for (const s of summaries) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);

  // Walk every day from the first workweek start, tracking weekly totals.
  const from = weekStart(opts.start, rules.weekStartsOn);
  const days: TimesheetDay[] = [];
  let weekTotal = 0;
  let currentWeek = from;
  for (let i = 0; i <= diffDays(opts.end, from); i++) {
    const day = addDays(from, i);
    const wk = weekStart(day, rules.weekStartsOn);
    if (wk !== currentWeek) {
      currentWeek = wk;
      weekTotal = 0;
    }
    const ps = byDay.get(day) ?? [];
    const worked = ps.reduce((n, p) => n + p.workedMinutes, 0);
    const before = weekTotal;
    weekTotal += worked;
    const overtime = Math.max(0, weekTotal - Math.max(before, rules.weeklyOvertimeAfter));
    if (day >= opts.start) {
      days.push({ day, punches: ps, workedMinutes: worked, regularMinutes: worked - overtime, overtimeMinutes: overtime });
    }
  }

  const sum = (k: "workedMinutes" | "regularMinutes" | "overtimeMinutes") => days.reduce((n, d) => n + d[k], 0);
  return {
    start: opts.start,
    end: opts.end,
    days,
    workedMinutes: sum("workedMinutes"),
    regularMinutes: sum("regularMinutes"),
    overtimeMinutes: sum("overtimeMinutes"),
    flagCount: days.reduce((n, d) => n + d.punches.reduce((m, p) => m + p.flags.filter((f) => f !== "open").length, 0), 0),
  };
}

export type PayPeriodKind = "weekly" | "biweekly" | "semimonthly";

/** The pay period containing `day`. `anchor` is any first day of a period (used by weekly and biweekly). */
export function payPeriodFor(day: Ymd, kind: PayPeriodKind, anchor: Ymd): { start: Ymd; end: Ymd } {
  if (kind === "semimonthly") {
    const [y, m, d] = day.split("-").map(Number);
    const mm = String(m).padStart(2, "0");
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return d <= 15 ? { start: `${y}-${mm}-01`, end: `${y}-${mm}-15` } : { start: `${y}-${mm}-16`, end: `${y}-${mm}-${lastDay}` };
  }
  const len = kind === "weekly" ? 7 : 14;
  const offset = ((diffDays(day, anchor) % len) + len) % len;
  const start = addDays(day, -offset);
  return { start, end: addDays(start, len - 1) };
}

export function previousPayPeriod(p: { start: Ymd }, kind: PayPeriodKind, anchor: Ymd) {
  return payPeriodFor(addDays(p.start, -1), kind, anchor);
}

export function nextPayPeriod(p: { end: Ymd }, kind: PayPeriodKind, anchor: Ymd) {
  return payPeriodFor(addDays(p.end, 1), kind, anchor);
}

/** 125 to "2:05" (hours:minutes, the way payroll sheets read). */
export function formatHours(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** 125 to "2.08" (decimal hours for payroll imports). */
export function decimalHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

export const FLAG_LABELS: Record<PunchFlag, string> = {
  open: "Still clocked in",
  open_break: "Break not ended",
  missed_meal: "No meal break on a shift over 5 hours",
  short_meal: "Meal break under 30 minutes",
  late_meal: "Meal break started after the 5th hour",
  missed_rest: "Fewer rest breaks than expected",
};
