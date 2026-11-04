// Pure rules and helpers for the Time off screens. Plain TypeScript so they can be unit tested.
// The server enforces every rule again; these only decide what to show and catch the obvious mistakes early.
import { isManager } from "@evergreen/core";
import type { Role, TimeOffInput, TimeOffRequest } from "./types";

type Viewer = { role: Role; membershipId: string };

/** Approve and Deny: owners and managers, on pending requests. A manager never sees them on their own request (the server refuses it too). Owners may review their own. */
export function canReview(viewer: Viewer, r: Pick<TimeOffRequest, "membershipId" | "status">): boolean {
  if (!isManager(viewer.role) || r.status !== "pending") return false;
  return !(viewer.role === "manager" && r.membershipId === viewer.membershipId);
}

/** Cancel: your own request while it is pending, or approved and not over yet. */
export function canCancel(viewer: Viewer, r: Pick<TimeOffRequest, "membershipId" | "status" | "endsAt">, now: Date): boolean {
  if (r.membershipId !== viewer.membershipId) return false;
  if (r.status === "pending") return true;
  return r.status === "approved" && new Date(r.endsAt).getTime() > now.getTime();
}

/** "2026-11-09" from the year, month (1 to 12) and day a person picked. No time zone is involved, a day is just a label. */
export function toDay(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The calendar day a picker's Date shows on the phone, as YYYY-MM-DD. Uses the phone's local date parts on purpose, so the day never shifts. */
export function dayFromPicker(d: Date): string {
  return toDay(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** A Date for a picker to show a YYYY-MM-DD day (local noon, so no time zone edge can move it to another day). */
export function pickerDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** "HH:MM" from a picker's Date (local clock parts). */
export function timeFromPicker(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** A Date for a picker to show an "HH:MM" time. */
export function pickerTime(hm: string): Date {
  const [h, m] = hm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m, 0);
}

/** Only the obvious mistake: the last day before the first day. Everything else is the server's call. Returns a message or null. */
export function validateRange(startDay: string, endDay: string): string | null {
  return endDay < startDay ? "The last day must be on or after the first day." : null;
}

/** The body for POST /time-off. Times are sent only for part-day requests, the reason only when there is one. */
export function buildRequest(form: { startDay: string; endDay: string; allDay: boolean; startTime: string; endTime: string; reason: string }): TimeOffInput {
  const reason = form.reason.trim();
  return {
    startDay: form.startDay,
    endDay: form.endDay,
    allDay: form.allDay,
    ...(form.allDay ? {} : { startTime: form.startTime, endTime: form.endTime }),
    ...(reason ? { reason } : {}),
  };
}
