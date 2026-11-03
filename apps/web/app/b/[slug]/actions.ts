"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { toResult } from "../../../lib/action-result";
import { auth } from "../../../lib/auth";
import * as pub from "../../../lib/services/public";

// Public actions. Each one is scoped by the business slug and, where it changes
// something, by the secret in the client's manage link or their verified email.

async function business(slug: string) {
  const ws = await pub.loadBusinessBySlug(String(slug));
  if (!ws) throw new Error("This booking page was not found.");
  return ws;
}

export async function publicSlotsAction(slug: string, q: { serviceId: string; staffId: string | null; day: string }, token?: string) {
  const ws = await business(slug);
  let exclude: string | undefined;
  if (token) {
    const found = await pub.loadByToken(ws, token);
    exclude = found?.a.id;
    if (found) q = { ...q, staffId: found.a.membershipId, serviceId: found.a.serviceId ?? q.serviceId };
  }
  return pub.publicSlots(ws, q, exclude);
}

export async function publicBookAction(slug: string, input: unknown) {
  const ws = await business(slug);
  let out: Awaited<ReturnType<typeof pub.publicBook>> | null = null;
  const r = await toResult(async () => {
    out = await pub.publicBook(ws, input);
    return { message: "Booked." };
  }, false);
  if (!r.ok) return r;
  return { ...r, booking: out! };
}

export async function publicCancelAction(slug: string, token: string) {
  const ws = await business(slug);
  return toResult(() => pub.cancelByToken(ws, token), false);
}

export async function publicRescheduleAction(slug: string, token: string, start: string) {
  const ws = await business(slug);
  const r = await toResult(async () => {
    const { token: fresh } = await pub.rescheduleByToken(ws, token, { start });
    return { message: "Your appointment has a new time.", data: fresh };
  }, false);
  return r;
}

/** From the client account page: open the manage screen for one appointment. */
export async function manageFromAccountAction(slug: string, appointmentId: string) {
  const ws = await business(slug);
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) redirect(`/b/${ws.slug}/me`);
  const token = await pub.manageTokenForClient(ws, session, appointmentId);
  redirect(`/b/${ws.slug}/manage/${token}`);
}
