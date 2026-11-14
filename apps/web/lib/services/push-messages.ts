import type { Vocabulary } from "@evergreen/core";

/**
 * Text for push notifications. Pure functions, no database. Everything here can show on a lock
 * screen: a first name, a service, a time. Never a phone number, email or note.
 */

export interface PushText {
  title: string;
  body: string;
}

/** "Tue, Nov 10 at 2:30 PM" in the business time zone. */
export function whenText(at: Date, tz: string): string {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(at);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at);
  return `${day} at ${time}`;
}

/** "Nov 10" from YYYY-MM-DD, no time zone involved. */
export function dayText(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function rangeText(startDay: string, endDay: string): string {
  return startDay === endDay ? dayText(startDay) : `${dayText(startDay)} to ${dayText(endDay)}`;
}

export const firstName = (full: string) => full.trim().split(/\s+/)[0] || "Someone";

export function newBookingText(v: Vocabulary, p: { clientFirstName: string; serviceName: string; staffName: string; startsAt: Date; tz: string }): PushText {
  return {
    title: `New ${v.appointment.toLowerCase()}`,
    body: `${p.clientFirstName}, ${p.serviceName} with ${firstName(p.staffName)}, ${whenText(p.startsAt, p.tz)}`,
  };
}

export function clientCancelledText(v: Vocabulary, p: { clientFirstName: string; serviceName: string; staffName: string; startsAt: Date; tz: string }): PushText {
  return {
    title: `${v.client} cancelled`,
    body: `${p.clientFirstName}, ${p.serviceName} with ${firstName(p.staffName)}, ${whenText(p.startsAt, p.tz)}`,
  };
}

export function timeOffRequestedText(p: { name: string; startDay: string; endDay: string }): PushText {
  return { title: "Time off request", body: `${firstName(p.name)} asked for ${rangeText(p.startDay, p.endDay)}` };
}

export function timeOffDecisionText(p: { decision: "approved" | "denied"; startDay: string; endDay: string }): PushText {
  return { title: p.decision === "approved" ? "Time off approved" : "Time off denied", body: `Your request for ${rangeText(p.startDay, p.endDay)} was ${p.decision}.` };
}

/** Never includes the message itself, since it can show on a lock screen. */
export function newMessageText(p: { senderName: string; conversationTitle: string | null; isReply: boolean }): PushText {
  const who = firstName(p.senderName);
  const what = p.isReply ? "replied" : "sent a message";
  return p.conversationTitle ? { title: p.conversationTitle, body: `${who} ${what}` } : { title: who, body: p.isReply ? "Replied in a thread" : "Sent you a message" };
}
