import "server-only";
import { and, asc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { appointments, clients, memberships, user, workspaces } from "@evergreen/db";
import {
  bookableDays,
  clientCanChange,
  formatTimeIn,
  mergedStarts,
  pickStaff,
  todayIn,
  utcToZoned,
  weekdayOf,
  ymd,
  type AppointmentStatus,
} from "@evergreen/core";
import { db } from "../db";
import type { AuditActor } from "../audit";
import { sendCancelled, sendConfirmation, sendRescheduled, sendStaffCancelled, sendStaffNewBooking } from "../notify";
import { hashToken, newToken } from "../tokens";
import { availability, changeStatus, insertAppointment, mailBusiness, moveAppointment, TAKEN_MESSAGE } from "./appointments";
import { loadCatalog, performers } from "./catalog";
import { clientName, findOrCreateClient, normalizePhone } from "./clients";
import { toWorkspace, type CtxWorkspace } from "./ctx";
import { loadBusinessHours, loadStaffHours } from "./hours";
import { notifyClientCancelled, notifyNewBooking } from "./push";
import { loadMembers } from "./workspace";

// Everything a client sees without a staff login: the booking page, the manage link
// from their email, and their optional account. No function here trusts anything but
// the slug, the manage secret, or the signed-in client's verified email.

export async function loadBusinessBySlug(slug: string): Promise<CtxWorkspace | null> {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null;
  const [ws] = await db().select().from(workspaces).where(and(eq(workspaces.slug, slug), isNull(workspaces.deletedAt))).limit(1);
  return ws ? toWorkspace(ws) : null;
}

export interface PublicMenu {
  business: { name: string; slug: string; brandColor: string; timezone: string; phone: string; address: string; policy: string; enabled: boolean; allowAnyStaff: boolean; vocab: CtxWorkspace["vocab"] };
  categories: { id: string | null; name: string; services: { id: string; name: string; description: string | null; minutes: number; priceCents: number; priceFrom: boolean; staffIds: string[] }[] }[];
  staff: { id: string; name: string; title: string | null; bio: string | null; color: string }[];
  days: string[];
}

/** The public menu: online services, who performs them, and bookable days. */
export async function loadPublicMenu(ws: CtxWorkspace): Promise<PublicMenu> {
  const [catalog, members, hours, biz] = await Promise.all([loadCatalog(ws.id), loadMembers(ws.id), loadStaffHours(ws.id), loadBusinessHours(ws.id)]);
  const openWeekdays = new Set(biz.map((w) => w.weekday));
  // People with no weekly schedule have no online times, so they are not shown.
  const online = members.filter((m) => m.bookable && m.bookableOnline && (hours[m.membershipId] ?? []).length > 0);
  const onlineIds = online.map((m) => m.membershipId);
  const services = catalog.services.filter((s) => s.bookableOnline);
  const groups = new Map<string | null, PublicMenu["categories"][number]>();
  for (const c of catalog.categories) groups.set(c.id, { id: c.id, name: c.name, services: [] });
  for (const s of services) {
    const staffIds = performers(catalog, s.id, onlineIds);
    if (!staffIds.length) continue;
    const key = s.categoryId && groups.has(s.categoryId) ? s.categoryId : null;
    if (!groups.has(key)) groups.set(key, { id: null, name: "More", services: [] });
    groups.get(key)!.services.push({
      id: s.id,
      name: s.name,
      description: s.description,
      minutes: s.activeBefore + s.processing + s.activeAfter,
      priceCents: s.priceCents,
      priceFrom: s.priceFrom,
      staffIds,
    });
  }
  const b = ws.settings.booking;
  return {
    business: {
      name: ws.name,
      slug: ws.slug,
      brandColor: ws.brandColor,
      timezone: ws.timezone,
      phone: ws.settings.contact.phone,
      address: ws.settings.contact.address,
      policy: b.policy,
      enabled: b.enabled,
      allowAnyStaff: b.allowAnyStaff,
      vocab: ws.vocab,
    },
    categories: [...groups.values()].filter((g) => g.services.length),
    staff: online.map((m) => ({ id: m.membershipId, name: m.name, title: m.title, bio: m.bio, color: m.color })),
    // Days the business is closed are left out of the picker.
    days: bookableDays(todayIn(ws.timezone, new Date()), b.maxAdvanceDays).filter((d) => openWeekdays.has(weekdayOf(d))),
  };
}

const slotQuery = z.object({ serviceId: z.uuid(), staffId: z.uuid().nullable(), day: ymd });

/** Open times for the booking page. "Any available" returns times only, never who is free. */
export async function publicSlots(ws: CtxWorkspace, raw: unknown, excludeAppointmentId?: string) {
  const q = slotQuery.parse(raw);
  if (!ws.settings.booking.enabled) return [];
  const days = bookableDays(todayIn(ws.timezone, new Date()), ws.settings.booking.maxAdvanceDays);
  if (!days.includes(q.day)) return [];
  if (!q.staffId && !ws.settings.booking.allowAnyStaff) return [];
  const res = await availability(ws, { serviceId: q.serviceId, staffId: q.staffId, day: q.day, now: new Date(), online: true, excludeAppointmentId });
  if (!res) return [];
  return mergedStarts(res.slots).map((t) => ({ start: new Date(t).toISOString(), label: formatTimeIn(new Date(t), ws.timezone) }));
}

const bookInput = z.object({
  serviceId: z.uuid(),
  staffId: z.uuid().nullable(),
  start: z.iso.datetime(),
  firstName: z.string().trim().min(1, "Add your first name").max(60),
  lastName: z.string().trim().min(1, "Add your last name").max(60),
  email: z.email("Check your email").trim().toLowerCase(),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => (normalizePhone(v)?.length ?? 0) >= 10, "Add a phone number so the business can reach you"),
  note: z.string().trim().max(1000).optional(),
  /** Hidden field. People leave it empty; bots fill it in. */
  website: z.string().max(0, "Something went wrong. Please try again.").optional(),
  agree: z.literal(true, { message: "Please read and accept the booking policy." }).optional(),
});

const MAX_ONLINE_PER_DAY = 4;

export async function publicBook(ws: CtxWorkspace, raw: unknown) {
  const v = bookInput.parse(raw);
  if (!ws.settings.booking.enabled) throw new Error("Online booking is turned off right now. Please call to book.");
  if (ws.settings.booking.policy && !v.agree) throw new Error("Please read and accept the booking policy.");
  const start = new Date(v.start);
  const day = utcToZoned(start, ws.timezone).day;

  // Slow down abuse: a handful of online bookings per email per day.
  const [{ n }] = await db()
    .select({ n: sql<number>`count(*)` })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .where(and(eq(appointments.workspaceId, ws.id), eq(clients.email, v.email), eq(appointments.source, "online"), gte(appointments.createdAt, new Date(Date.now() - 86_400_000))));
  if (Number(n) >= MAX_ONLINE_PER_DAY) throw new Error("That is a lot of bookings for one day. Please call the business to book more.");

  const res = await availability(ws, { serviceId: v.serviceId, staffId: v.staffId, day, now: new Date(), online: true });
  if (!res) throw new Error("That service is not available online.");
  if (!v.staffId && !ws.settings.booking.allowAnyStaff) throw new Error("Please pick who you would like to see.");
  const staffId = v.staffId ? (res.slots.find((s) => s.staffId === v.staffId)?.starts.includes(start.getTime()) ? v.staffId : null) : pickStaff(start.getTime(), res.slots, res.bookedMinutes);
  if (!staffId) throw new Error(TAKEN_MESSAGE);

  const members = await loadMembers(ws.id);
  const staff = members.find((m) => m.membershipId === staffId)!;
  const client = await findOrCreateClient(ws.id, { firstName: v.firstName, lastName: v.lastName, email: v.email, phone: v.phone });
  const actor: AuditActor = { workspaceId: ws.id, userId: null, label: `Online booking (${v.email})` };
  const { timing, priceCents } = res.timingByStaff[staffId];
  const made = await insertAppointment({
    ws,
    clientId: client.id,
    membershipId: staffId,
    service: res.service,
    timing,
    priceCents,
    startsAt: start,
    source: "online",
    clientNote: v.note || null,
    createdBy: null,
    allowOverlap: false,
    actor,
    withManageToken: true,
  });

  const mail = { serviceName: res.service.name, startsAt: start, priceCents, staffName: staff.name };
  await Promise.all([
    sendConfirmation(v.email, v.firstName, mail, mailBusiness(ws), made.token),
    ws.settings.booking.notifyStaff ? sendStaffNewBooking(staff.email, `${v.firstName} ${v.lastName}`, mail, mailBusiness(ws)) : Promise.resolve(true),
    notifyNewBooking(ws, { clientFirstName: v.firstName, serviceName: res.service.name, staffMembershipId: staffId, staffName: staff.name, startsAt: start, appointmentId: made.id }),
  ]);
  return {
    token: made.token!,
    summary: { serviceName: res.service.name, staffName: staff.name, when: start.toISOString(), priceCents, priceFrom: res.service.priceFrom },
  };
}

/** The appointment behind a manage link. */
export async function loadByToken(ws: CtxWorkspace, token: string) {
  if (!token || token.length > 100) return null;
  const [row] = await db()
    .select({ a: appointments, c: clients, staffName: user.name })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(memberships, eq(memberships.id, appointments.membershipId))
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(appointments.workspaceId, ws.id), eq(appointments.manageTokenHash, hashToken(token)), isNull(appointments.deletedAt)))
    .limit(1);
  if (!row) return null;
  const changeable = ["booked", "confirmed"].includes(row.a.status) && clientCanChange(row.a.startsAt.getTime(), Date.now(), ws.settings.booking.cancelWindowHours);
  return { ...row, changeable };
}

export async function cancelByToken(ws: CtxWorkspace, token: string) {
  const found = await loadByToken(ws, token);
  if (!found) throw new Error("That link is no longer valid.");
  if (!found.changeable) throw new Error(`This appointment can no longer be cancelled online. Please call ${ws.name}.`);
  await changeStatus(found.a, "cancelled" as AppointmentStatus, { workspaceId: ws.id, userId: null, label: `Client (${found.c.email ?? clientName(found.c)})` }, "client");
  const mail = { serviceName: found.a.serviceName, startsAt: found.a.startsAt, priceCents: found.a.priceCents, staffName: found.staffName };
  const [staff] = await db().select({ email: user.email }).from(memberships).innerJoin(user, eq(user.id, memberships.userId)).where(eq(memberships.id, found.a.membershipId));
  await Promise.all([
    found.c.email ? sendCancelled(found.c.email, found.c.firstName, mail, mailBusiness(ws)) : Promise.resolve(true),
    staff && ws.settings.booking.notifyStaff ? sendStaffCancelled(staff.email, clientName(found.c), mail, mailBusiness(ws)) : Promise.resolve(true),
    notifyClientCancelled(ws, { clientFirstName: found.c.firstName, serviceName: found.a.serviceName, staffMembershipId: found.a.membershipId, staffName: found.staffName, startsAt: found.a.startsAt, appointmentId: found.a.id }),
  ]);
  return { message: "Your appointment is cancelled." };
}

/** Client picks a new time with the same person. Returns a fresh manage token. */
export async function rescheduleByToken(ws: CtxWorkspace, token: string, raw: unknown) {
  const { start } = z.object({ start: z.iso.datetime() }).parse(raw);
  const found = await loadByToken(ws, token);
  if (!found) throw new Error("That link is no longer valid.");
  if (!found.changeable) throw new Error(`This appointment can no longer be changed online. Please call ${ws.name}.`);
  const a = found.a;
  if (!a.serviceId) throw new Error(`Please call ${ws.name} to change this appointment.`);
  const at = new Date(start);
  const day = utcToZoned(at, ws.timezone).day;
  const res = await availability(ws, { serviceId: a.serviceId, staffId: a.membershipId, day, now: new Date(), online: true, excludeAppointmentId: a.id });
  if (!res?.slots[0]?.starts.includes(at.getTime())) throw new Error(TAKEN_MESSAGE);
  await moveAppointment(a, { membershipId: a.membershipId, startsAt: at, allowOverlap: false, actor: { workspaceId: ws.id, userId: null, label: `Client (${found.c.email ?? ""})` } });
  const fresh = newToken();
  await db().update(appointments).set({ manageTokenHash: hashToken(fresh) }).where(eq(appointments.id, a.id));
  if (found.c.email) {
    await sendRescheduled(found.c.email, found.c.firstName, { serviceName: a.serviceName, startsAt: at, priceCents: a.priceCents, staffName: found.staffName }, mailBusiness(ws), fresh);
  }
  return { token: fresh };
}

/** A signed-in client's appointments at one business, matched on their verified email. */
export async function clientAppointments(ws: CtxWorkspace, session: { user: { id: string; email: string; emailVerified: boolean } }) {
  if (!session.user.emailVerified) return null;
  const email = session.user.email.toLowerCase();
  const mine = await db().select().from(clients).where(and(eq(clients.workspaceId, ws.id), eq(clients.email, email), isNull(clients.deletedAt)));
  if (!mine.length) return { upcoming: [], past: [], name: null as string | null };
  const unlinked = mine.filter((c) => !c.userId).map((c) => c.id);
  if (unlinked.length) await db().update(clients).set({ userId: session.user.id }).where(inArray(clients.id, unlinked));
  const rows = await db()
    .select({ a: appointments, staffName: user.name })
    .from(appointments)
    .innerJoin(memberships, eq(memberships.id, appointments.membershipId))
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(appointments.workspaceId, ws.id), inArray(appointments.clientId, mine.map((c) => c.id)), isNull(appointments.deletedAt)))
    .orderBy(asc(appointments.startsAt));
  const now = Date.now();
  const list = rows.map((r) => ({
    id: r.a.id,
    serviceName: r.a.serviceName,
    staffName: r.staffName,
    startsAt: r.a.startsAt.toISOString(),
    status: r.a.status,
    changeable: ["booked", "confirmed"].includes(r.a.status) && clientCanChange(r.a.startsAt.getTime(), now, ws.settings.booking.cancelWindowHours),
  }));
  return {
    name: mine[0].firstName,
    upcoming: list.filter((x) => new Date(x.startsAt).getTime() >= now && ["booked", "confirmed", "checked_in"].includes(x.status)),
    past: list.filter((x) => new Date(x.startsAt).getTime() < now || !["booked", "confirmed", "checked_in"].includes(x.status)).reverse().slice(0, 30),
  };
}

/**
 * A manage link for a signed-in client's own appointment, so the account page can
 * reuse the manage screen. The old link stops working.
 */
export async function manageTokenForClient(ws: CtxWorkspace, session: { user: { email: string; emailVerified: boolean } }, appointmentId: string) {
  if (!session.user.emailVerified) throw new Error("Please sign in again.");
  const [row] = await db()
    .select({ id: appointments.id })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .where(and(eq(appointments.id, appointmentId), eq(appointments.workspaceId, ws.id), eq(clients.email, session.user.email.toLowerCase()), gt(appointments.startsAt, new Date())));
  if (!row) throw new Error("That appointment was not found.");
  const token = newToken();
  await db().update(appointments).set({ manageTokenHash: hashToken(token) }).where(eq(appointments.id, row.id));
  return token;
}
