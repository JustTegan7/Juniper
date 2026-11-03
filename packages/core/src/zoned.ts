// Wall-clock time in a business's time zone, with no dependencies.
// A "local time" is a day ("YYYY-MM-DD") plus minutes after midnight in an IANA zone.
// Everything stored in the database is a real instant (timestamptz); these helpers
// convert between the two, including across daylight saving changes.

import type { Ymd } from "./dates";

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(timeZone: string) {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

/** Breaks an instant into wall-clock parts in a zone. */
export function zonedParts(at: Date, timeZone: string) {
  const parts = dtf(timeZone).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** Offset of the zone from UTC at an instant, in minutes (Pacific is -480 or -420). */
export function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The instant for a wall-clock time in a zone. Times skipped by a spring-forward
 * change move forward by the gap (2:30 AM becomes 3:30 AM). Times repeated in the
 * fall use the first (daylight) one.
 */
export function zonedToUtc(day: Ymd, minutes: number, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  // Two passes settle the offset on either side of a change.
  let guess = naive - zoneOffsetMinutes(new Date(naive), timeZone) * 60_000;
  const off2 = zoneOffsetMinutes(new Date(guess), timeZone);
  guess = naive - off2 * 60_000;
  const off3 = zoneOffsetMinutes(new Date(guess), timeZone);
  if (off3 !== off2) guess = naive - Math.min(off2, off3) * 60_000;
  return new Date(guess);
}

/** The local day, minutes after midnight and weekday (0 Sunday) of an instant. */
export function utcToZoned(at: Date, timeZone: string): { day: Ymd; minutes: number; weekday: number } {
  const p = zonedParts(at, timeZone);
  const day = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return { day, minutes: p.hour * 60 + p.minute, weekday: weekdayOf(day) };
}

/** 0 Sunday to 6 Saturday. */
export function weekdayOf(day: Ymd): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** "09:30" to 570. Returns null for anything that is not a valid time. */
export function parseHm(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/** 570 to "09:30" (for time inputs). */
export function toHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 570 to "9:30 AM", 720 to "12 PM". */
export function formatMinutes(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "9:30 AM" for an instant in a zone. */
export function formatTimeIn(at: Date, timeZone: string): string {
  return formatMinutes(utcToZoned(at, timeZone).minutes);
}

/** "Tue, Nov 3" for a day. */
export function formatDay(day: Ymd, opts: { weekday?: "short" | "long"; year?: boolean } = {}): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: opts.weekday ?? "short",
    month: "short",
    day: "numeric",
    year: opts.year ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

/** "1 hr 15 min", "45 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} hr`;
  return `${h} hr ${m} min`;
}
