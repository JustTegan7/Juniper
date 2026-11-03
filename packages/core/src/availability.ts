// Booking availability. Pure functions shared by the web app, the public booking
// page and the future phone app. All instants are epoch milliseconds.

import { addDays, type Ymd } from "./dates";
import { weekdayOf, zonedToUtc } from "./zoned";

export interface Interval {
  start: number;
  end: number;
}

/** Minutes-after-midnight window on one day, end exclusive. */
export interface DayWindow {
  start: number;
  end: number;
}

/**
 * How a service uses a staff member's time. During `processing` (color developing,
 * for example) the staff member is free to start or finish someone else, unless the
 * service turns that off by setting processing to 0 and folding it into activeBefore.
 */
export interface ServiceTiming {
  activeBefore: number;
  processing: number;
  activeAfter: number;
  /** Cleanup after the client leaves. Blocks the staff member but not the client. */
  bufferAfter: number;
}

export function serviceLength(t: ServiceTiming): number {
  return t.activeBefore + t.processing + t.activeAfter;
}

/** The stretches of an appointment when the staff member is busy (processing time excluded). */
export function busySegments(start: number, t: ServiceTiming): Interval[] {
  const min = 60_000;
  const total = serviceLength(t);
  if (t.processing <= 0) {
    return [{ start, end: start + (total + t.bufferAfter) * min }];
  }
  const out: Interval[] = [];
  if (t.activeBefore > 0) out.push({ start, end: start + t.activeBefore * min });
  const afterStart = start + (t.activeBefore + t.processing) * min;
  const afterEnd = start + (total + t.bufferAfter) * min;
  if (afterEnd > afterStart) out.push({ start: afterStart, end: afterEnd });
  if (!out.length) out.push({ start, end: start + Math.max(total, 1) * min });
  return out;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Weekly working hours: weekday 0 (Sunday) to 6, minutes after midnight. Several rows per day allowed (split shifts). */
export interface WeeklyHours {
  weekday: number;
  start: number;
  end: number;
}

/** A dated change to someone's hours. `null` start/end means off that day. Several rows on one day add windows. */
export interface HoursOverride {
  day: Ymd;
  start: number | null;
  end: number | null;
}

/** Working windows for one day: dated overrides replace the weekly pattern for that day. */
export function hoursForDay(day: Ymd, weekly: WeeklyHours[], overrides: HoursOverride[] = []): DayWindow[] {
  const todays = overrides.filter((o) => o.day === day);
  const source = todays.length
    ? todays.filter((o): o is { day: Ymd; start: number; end: number } => o.start != null && o.end != null)
    : weekly.filter((w) => w.weekday === weekdayOf(day));
  return mergeWindows(source.map((w) => ({ start: w.start, end: w.end })).filter((w) => w.end > w.start));
}

export function mergeWindows(ws: DayWindow[]): DayWindow[] {
  const sorted = [...ws].sort((a, b) => a.start - b.start);
  const out: DayWindow[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else out.push({ ...w });
  }
  return out;
}

/** Overlap of two sets of windows (staff hours inside business hours). */
export function intersectWindows(a: DayWindow[], b: DayWindow[]): DayWindow[] {
  const out: DayWindow[] = [];
  for (const x of a) for (const y of b) {
    const start = Math.max(x.start, y.start);
    const end = Math.min(x.end, y.end);
    if (end > start) out.push({ start, end });
  }
  return mergeWindows(out);
}

export interface StaffDay {
  id: string;
  /** Working windows for the day (already combined with business hours if the business wants that). */
  windows: DayWindow[];
  /** Busy instants: existing appointments' busy segments, approved time off, blocks. */
  busy: Interval[];
}

export interface SlotQuery {
  day: Ymd;
  timeZone: string;
  now: Date;
  timing: ServiceTiming;
  /** Start times are offered every `step` minutes from midnight (15 is typical). */
  step: number;
  /** Earliest bookable start is now plus this many minutes. */
  minLeadMinutes: number;
  staff: StaffDay[];
}

export interface StaffSlots {
  staffId: string;
  starts: number[];
}

/** Open start times per staff member for one service on one day. */
export function openSlots(q: SlotQuery): StaffSlots[] {
  const length = serviceLength(q.timing);
  const earliest = q.now.getTime() + q.minLeadMinutes * 60_000;
  const step = Math.max(5, q.step);
  return q.staff.map((s) => {
    const starts: number[] = [];
    for (const w of s.windows) {
      const first = Math.ceil(w.start / step) * step;
      for (let m = first; m + length <= w.end; m += step) {
        const start = zonedToUtc(q.day, m, q.timeZone).getTime();
        if (start < earliest) continue;
        const segs = busySegments(start, q.timing);
        if (segs.some((seg) => s.busy.some((b) => overlaps(seg, b)))) continue;
        starts.push(start);
      }
    }
    return { staffId: s.id, starts: [...new Set(starts)].sort((a, b) => a - b) };
  });
}

/** Every start time where at least one staff member is free, for "Any available". */
export function mergedStarts(slots: StaffSlots[]): number[] {
  return [...new Set(slots.flatMap((s) => s.starts))].sort((a, b) => a - b);
}

/**
 * Picks who gets an "Any available" booking: the free staff member with the fewest
 * booked minutes that day, then the order given (the business's display order).
 */
export function pickStaff(start: number, slots: StaffSlots[], bookedMinutes: Record<string, number>): string | null {
  const free = slots.filter((s) => s.starts.includes(start)).map((s) => s.staffId);
  if (!free.length) return null;
  return free.reduce((best, id) => ((bookedMinutes[id] ?? 0) < (bookedMinutes[best] ?? 0) ? id : best), free[0]);
}

/** Days a client may book: from today through today + maxAdvanceDays. */
export function bookableDays(today: Ymd, maxAdvanceDays: number): Ymd[] {
  return Array.from({ length: Math.max(1, maxAdvanceDays + 1) }, (_, i) => addDays(today, i));
}

/** Can a client still cancel or reschedule online? */
export function clientCanChange(startMs: number, nowMs: number, cancelWindowHours: number): boolean {
  return startMs - nowMs >= cancelWindowHours * 3_600_000;
}
