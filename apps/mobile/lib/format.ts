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
