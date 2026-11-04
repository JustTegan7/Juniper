// Display helpers. Plain TypeScript so they can be tested; time zone rules come from @evergreen/core.
import { STATUS_LABELS, formatDay, formatDuration, formatTimeIn, type AppointmentStatus } from "@evergreen/core";
import type { Appointment, Vocabulary } from "./types";

export function timeRange(a: Pick<Appointment, "startsAt" | "endsAt">, timeZone: string): string {
  return `${formatTimeIn(new Date(a.startsAt), timeZone)} to ${formatTimeIn(new Date(a.endsAt), timeZone)}`;
}

export function durationLabel(a: Pick<Appointment, "startsAt" | "endsAt">): string {
  return formatDuration(Math.round((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60000));
}

export function dayLabel(day: string): string {
  return formatDay(day, { weekday: "long" });
}

export function statusLabel(s: AppointmentStatus): string {
  return STATUS_LABELS[s];
}

export function price(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function roleLabel(role: string): string {
  return role === "owner" ? "Owner" : role === "manager" ? "Manager" : "Team member";
}

/** "No stylist appointments today" style empty text, using the business's own words. */
export function emptyToday(vocab: Vocabulary, scope: "mine" | "all"): string {
  const noun = vocab.appointmentPlural.toLowerCase();
  return scope === "mine" ? `No ${noun} for you today.` : `No ${noun} on the calendar today.`;
}

/** Actions to offer for an appointment in its current status. */
export type StatusAction = { status: AppointmentStatus; label: string; destructive?: boolean };

export function statusActions(current: AppointmentStatus): StatusAction[] {
  switch (current) {
    case "booked":
      return [
        { status: "confirmed", label: "Confirm" },
        { status: "checked_in", label: "Check in" },
        { status: "no_show", label: "No show" },
        { status: "cancelled", label: "Cancel", destructive: true },
      ];
    case "confirmed":
      return [
        { status: "checked_in", label: "Check in" },
        { status: "no_show", label: "No show" },
        { status: "cancelled", label: "Cancel", destructive: true },
      ];
    case "checked_in":
      return [
        { status: "completed", label: "Complete" },
        { status: "no_show", label: "No show" },
        { status: "cancelled", label: "Cancel", destructive: true },
      ];
    case "completed":
    case "cancelled":
    case "no_show":
      return [];
  }
}

// ---- Clock ----

/** Milliseconds from an ISO instant to `now`. Never negative (a phone clock a little behind the server shows 0). */
export function elapsedMs(fromIso: string, now: Date): number {
  return Math.max(0, now.getTime() - new Date(fromIso).getTime());
}

/** A running timer: "5:09" under an hour, "1:05:09" from one hour. Whole seconds, rounded down. */
export function formatTimer(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** How long someone has been clocked in, as a timer. */
export function elapsedTimer(clockInIso: string, now: Date): string {
  return formatTimer(elapsedMs(clockInIso, now));
}

/** Length of a break. An open break ticks like a timer; a finished one reads "12 min" (under a minute reads "Under 1 min"). */
export function breakLength(b: { startsAt: string; endsAt: string | null }, now: Date): string {
  if (!b.endsAt) return formatTimer(elapsedMs(b.startsAt, now));
  const minutes = Math.floor(elapsedMs(b.startsAt, new Date(b.endsAt)) / 60000);
  return minutes < 1 ? "Under 1 min" : formatDuration(minutes);
}

export function breakLabel(kind: "meal" | "rest"): string {
  return kind === "meal" ? "Meal break" : "Rest break";
}

/** Which clock buttons to show. Break buttons only while clocked in with no break open; rest breaks only when the business tracks them. */
export type ClockButtons = { clockIn: boolean; clockOut: boolean; startMeal: boolean; startRest: boolean; endBreak: boolean };

export function clockButtons(clock: { clockedIn: boolean; openBreak: unknown | null }, trackRestBreaks: boolean): ClockButtons {
  const onBreak = clock.clockedIn && clock.openBreak != null;
  const canStartBreak = clock.clockedIn && !onBreak;
  return {
    clockIn: !clock.clockedIn,
    clockOut: clock.clockedIn,
    startMeal: canStartBreak,
    startRest: canStartBreak && trackRestBreaks,
    endBreak: onBreak,
  };
}

// ---- Time off ----

/** "Mon, Nov 9" or "Mon, Nov 9 to Wed, Nov 11". */
export function dayRange(startDay: string, endDay: string): string {
  const a = formatDay(startDay, { weekday: "short" });
  return startDay === endDay ? a : `${a} to ${formatDay(endDay, { weekday: "short" })}`;
}

/** The day plus, for part-day requests, the hours in the business time zone. */
export function timeOffWhen(r: { startDay: string; endDay: string; allDay: boolean; startsAt: string; endsAt: string }, timeZone: string): string {
  if (r.allDay) return `${dayRange(r.startDay, r.endDay)}, all day`;
  const from = formatTimeIn(new Date(r.startsAt), timeZone);
  const to = formatTimeIn(new Date(r.endsAt), timeZone);
  return r.startDay === r.endDay ? `${dayRange(r.startDay, r.endDay)}, ${from} to ${to}` : `${formatDay(r.startDay, { weekday: "short" })}, ${from} to ${formatDay(r.endDay, { weekday: "short" })}, ${to}`;
}
