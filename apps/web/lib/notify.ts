import "server-only";
import { formatDay, formatPrice, formatTimeIn, utcToZoned } from "@evergreen/core";
import { sendEmail } from "./email";
import { appUrl } from "./platform";

// Client and staff emails. Plain text keeps them readable everywhere and out of spam folders.
// SMS plugs in here later: each function gets a text version and a sendText() call.

export interface MailAppointment {
  serviceName: string;
  startsAt: Date;
  priceCents: number;
  staffName: string;
}

export interface MailBusiness {
  name: string;
  slug: string;
  timezone: string;
  phone?: string;
  address?: string;
  policy?: string;
}

function when(a: MailAppointment, b: MailBusiness) {
  const day = utcToZoned(a.startsAt, b.timezone).day;
  return `${formatDay(day, { weekday: "long" })} at ${formatTimeIn(a.startsAt, b.timezone)}`;
}

function footer(b: MailBusiness) {
  return [b.name, b.address, b.phone].filter(Boolean).join("\n");
}

export function manageLink(b: MailBusiness, token: string) {
  return `${appUrl()}/b/${b.slug}/manage/${token}`;
}

export async function sendConfirmation(to: string, firstName: string, a: MailAppointment, b: MailBusiness, token: string | null) {
  const lines = [
    `Hi ${firstName},`,
    "",
    `You're booked at ${b.name}.`,
    "",
    `${a.serviceName} with ${a.staffName}`,
    when(a, b),
    a.priceCents ? `Price: ${formatPrice(a.priceCents)}` : "",
    "",
    token ? `Need to change it? Reschedule or cancel here:\n${manageLink(b, token)}` : "",
    b.policy ? `\n${b.policy}` : "",
    "",
    footer(b),
  ];
  return sendEmail({ to, subject: `Booked: ${a.serviceName}, ${when(a, b)}`, text: lines.filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n") });
}

export async function sendRescheduled(to: string, firstName: string, a: MailAppointment, b: MailBusiness, token: string | null) {
  const text = [
    `Hi ${firstName},`,
    "",
    `Your appointment at ${b.name} has a new time.`,
    "",
    `${a.serviceName} with ${a.staffName}`,
    when(a, b),
    "",
    token ? `Manage it here:\n${manageLink(b, token)}\n` : "",
    footer(b),
  ].join("\n");
  return sendEmail({ to, subject: `New time: ${a.serviceName}, ${when(a, b)}`, text });
}

export async function sendCancelled(to: string, firstName: string, a: MailAppointment, b: MailBusiness) {
  const text = [
    `Hi ${firstName},`,
    "",
    `Your ${a.serviceName} with ${a.staffName} on ${when(a, b)} is cancelled.`,
    "",
    `Book again any time: ${appUrl()}/b/${b.slug}`,
    "",
    footer(b),
  ].join("\n");
  return sendEmail({ to, subject: `Cancelled: ${a.serviceName}, ${when(a, b)}`, text });
}

export async function sendReminder(to: string, firstName: string, a: MailAppointment, b: MailBusiness, token: string | null) {
  const text = [
    `Hi ${firstName},`,
    "",
    `A reminder of your appointment at ${b.name}:`,
    "",
    `${a.serviceName} with ${a.staffName}`,
    when(a, b),
    "",
    token ? `Need to change it? ${manageLink(b, token)}\n` : "",
    footer(b),
  ].join("\n");
  return sendEmail({ to, subject: `Reminder: ${a.serviceName}, ${when(a, b)}`, text });
}

export async function sendStaffNewBooking(to: string, clientName: string, a: MailAppointment, b: MailBusiness) {
  return sendEmail({
    to,
    subject: `New online booking: ${clientName}, ${when(a, b)}`,
    text: `${clientName} booked ${a.serviceName} with you on ${when(a, b)}.\n\nSee it on your ${b.name} calendar: ${appUrl()}/calendar?day=${utcToZoned(a.startsAt, b.timezone).day}`,
  });
}

export async function sendStaffCancelled(to: string, clientName: string, a: MailAppointment, b: MailBusiness) {
  return sendEmail({
    to,
    subject: `Cancelled online: ${clientName}, ${when(a, b)}`,
    text: `${clientName} cancelled ${a.serviceName} on ${when(a, b)}. That time is open again.`,
  });
}
