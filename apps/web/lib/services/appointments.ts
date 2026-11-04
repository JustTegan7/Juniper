import "server-only";
import { and, asc, eq, gt, inArray, isNull, lt, ne } from "drizzle-orm";
import { z } from "zod";
import { appointments, appointmentSegments, auditLog, clients, memberships, user, uuidv7 } from "@evergreen/db";
import {
  addDays,
  APPOINTMENT_STATUSES,
  busySegments,
  HOLDING_STATUSES,
  hoursForDay,
  intersectWindows,
  isManager,
  openSlots,
  overlaps,
  parseHm,
  serviceLength,
  utcToZoned,
  ymd,
  zonedToUtc,
  type AppointmentStatus,
  type DayWindow,
  type Interval,
  type ServiceTiming,
  type StaffSlots,
} from "@evergreen/core";
import { batch, db } from "../db";
import { auditRow, type AuditActor } from "../audit";
import { sendCancelled, sendConfirmation, sendRescheduled, type MailBusiness } from "../notify";
import { hashToken, newToken } from "../tokens";
import { loadCatalog, performers, timingFor, type Catalog, type Service } from "./catalog";
import { clientName, formatPhone } from "./clients";
import { actorOf, canManageStaff, ForbiddenError, NotFoundError, type Ctx, type CtxWorkspace } from "./ctx";
import { loadBusinessHours, loadOverrides, loadStaffHours } from "./hours";
import { approvedTimeOff } from "./timeoff";
import { loadMembers, type Member } from "./workspace";

export type Appointment = typeof appointments.$inferSelect;

export function mailBusiness(ws: CtxWorkspace): MailBusiness {
  return {
    name: ws.name,
    slug: ws.slug,
    timezone: ws.timezone,
    phone: ws.settings.contact.phone,
    address: ws.settings.contact.address,
    policy: ws.settings.booking.policy,
  };
}

export function timingOf(a: Pick<Appointment, "activeBefore" | "processing" | "activeAfter" | "bufferAfter">): ServiceTiming {
  return { activeBefore: a.activeBefore, processing: a.processing, activeAfter: a.activeAfter, bufferAfter: a.bufferAfter };
}

/** Day boundaries (real instants) for a local day. */
export function dayBounds(day: string, tz: string) {
  return { from: zonedToUtc(day, 0, tz), to: zonedToUtc(addDays(day, 1), 0, tz) };
}

export interface DayPlan {
  /** Staff hours for the day (dated changes applied). */
  staffWindows: Record<string, DayWindow[]>;
  /** Staff hours inside business hours: what online booking offers. */
  onlineWindows: Record<string, DayWindow[]>;
  businessWindows: DayWindow[];
  /** Everything that blocks booking: appointment segments plus time off. */
  busy: Record<string, Interval[]>;
  appointmentBusy: Record<string, Interval[]>;
  timeOff: Record<string, Interval[]>;
  bookedMinutes: Record<string, number>;
}

/** Everything availability needs for one local day and a set of staff. */
export async function loadDayPlan(ws: CtxWorkspace, day: string, membershipIds: string[], excludeAppointmentId?: string): Promise<DayPlan> {
  const { from, to } = dayBounds(day, ws.timezone);
  // A little slack either side catches long appointments that cross midnight.
  const slackFrom = new Date(from.getTime() - 12 * 3_600_000);
  const slackTo = new Date(to.getTime() + 12 * 3_600_000);
  const [weekly, overrides, biz, segs, off, appts] = await Promise.all([
    loadStaffHours(ws.id, membershipIds),
    loadOverrides(ws.id, day, day, membershipIds),
    loadBusinessHours(ws.id),
    membershipIds.length
      ? db()
          .select()
          .from(appointmentSegments)
          .where(
            and(
              eq(appointmentSegments.workspaceId, ws.id),
              inArray(appointmentSegments.membershipId, membershipIds),
              lt(appointmentSegments.startsAt, slackTo),
              gt(appointmentSegments.endsAt, slackFrom),
              ...(excludeAppointmentId ? [ne(appointmentSegments.appointmentId, excludeAppointmentId)] : []),
            ),
          )
      : Promise.resolve([]),
    approvedTimeOff(ws.id, slackFrom, slackTo, membershipIds),
    membershipIds.length
      ? db()
          .select({ membershipId: appointments.membershipId, startsAt: appointments.startsAt, endsAt: appointments.endsAt })
          .from(appointments)
          .where(and(eq(appointments.workspaceId, ws.id), inArray(appointments.membershipId, membershipIds), isNull(appointments.deletedAt), inArray(appointments.status, HOLDING_STATUSES), lt(appointments.startsAt, to), gt(appointments.startsAt, from)))
      : Promise.resolve([]),
  ]);
  const businessWindows = hoursForDay(day, biz);
  const plan: DayPlan = { staffWindows: {}, onlineWindows: {}, businessWindows, busy: {}, appointmentBusy: {}, timeOff: {}, bookedMinutes: {} };
  for (const id of membershipIds) {
    const w = hoursForDay(day, weekly[id] ?? [], overrides[id] ?? []);
    plan.staffWindows[id] = w;
    plan.onlineWindows[id] = intersectWindows(w, businessWindows);
    plan.timeOff[id] = off.filter((t) => t.membershipId === id).map((t) => ({ start: t.startsAt.getTime(), end: t.endsAt.getTime() }));
    plan.appointmentBusy[id] = segs.filter((s) => s.membershipId === id).map((s) => ({ start: s.startsAt.getTime(), end: s.endsAt.getTime() }));
    plan.busy[id] = [...plan.appointmentBusy[id], ...plan.timeOff[id]];
    plan.bookedMinutes[id] = appts.filter((a) => a.membershipId === id).reduce((n, a) => n + (a.endsAt.getTime() - a.startsAt.getTime()) / 60_000, 0);
  }
  return plan;
}

export interface AvailabilityResult {
  service: Service;
  slots: StaffSlots[];
  timingByStaff: Record<string, { timing: ServiceTiming; priceCents: number }>;
  bookedMinutes: Record<string, number>;
}

/**
 * Open start times for a service on a day. Online bookings use business hours,
 * lead time and only staff who take online bookings.
 */
export async function availability(
  ws: CtxWorkspace,
  opts: { serviceId: string; staffId: string | null; day: string; now: Date; online: boolean; catalog?: Catalog; members?: Member[]; excludeAppointmentId?: string },
): Promise<AvailabilityResult | null> {
  const catalog = opts.catalog ?? (await loadCatalog(ws.id));
  const service = catalog.services.find((s) => s.id === opts.serviceId && s.active && (!opts.online || s.bookableOnline));
  if (!service) return null;
  const members = opts.members ?? (await loadMembers(ws.id));
  const bookable = members.filter((m) => m.bookable && (!opts.online || m.bookableOnline)).map((m) => m.membershipId);
  let staffIds = performers(catalog, service.id, bookable);
  if (opts.staffId) staffIds = staffIds.filter((id) => id === opts.staffId);
  const plan = await loadDayPlan(ws, opts.day, staffIds, opts.excludeAppointmentId);
  const timingByStaff: AvailabilityResult["timingByStaff"] = {};
  const slots: StaffSlots[] = [];
  for (const id of staffIds) {
    const t = timingFor(service, catalog.overrides.find((o) => o.serviceId === service.id && o.membershipId === id));
    timingByStaff[id] = t;
    const [s] = openSlots({
      day: opts.day,
      timeZone: ws.timezone,
      now: opts.now,
      timing: t.timing,
      step: ws.settings.booking.slotStep,
      minLeadMinutes: opts.online ? ws.settings.booking.minLeadMinutes : 0,
      staff: [{ id, windows: opts.online ? plan.onlineWindows[id] : plan.staffWindows[id], busy: plan.busy[id] }],
    });
    slots.push(s);
  }
  return { service, slots, timingByStaff, bookedMinutes: plan.bookedMinutes };
}

/** Postgres exclusion violation: someone else holds that time. */
export function isOverlapError(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    const c = cur as { code?: string; constraint?: string; message?: string; cause?: unknown };
    if (c.code === "23P01" || c.constraint === "appointment_segments_no_overlap" || c.message?.includes("appointment_segments_no_overlap")) return true;
    cur = c.cause;
  }
  return false;
}

export const TAKEN_MESSAGE = "That time was just taken. Pick another time.";

function segmentRows(workspaceId: string, appointmentId: string, membershipId: string, start: Date, timing: ServiceTiming, allowOverlap: boolean) {
  return busySegments(start.getTime(), timing).map((s) => ({
    workspaceId,
    appointmentId,
    membershipId,
    startsAt: new Date(s.start),
    endsAt: new Date(s.end),
    allowOverlap,
  }));
}

export interface NewAppointment {
  ws: CtxWorkspace;
  clientId: string;
  membershipId: string;
  service: Service;
  timing: ServiceTiming;
  priceCents: number;
  startsAt: Date;
  source: "online" | "staff";
  clientNote?: string | null;
  staffNote?: string | null;
  createdBy: string | null;
  allowOverlap: boolean;
  actor: AuditActor;
  withManageToken: boolean;
}

/** Writes an appointment and its busy segments together. The database refuses overlaps unless allowOverlap is set. */
export async function insertAppointment(n: NewAppointment) {
  const id = uuidv7();
  const token = n.withManageToken ? newToken() : null;
  const length = serviceLength(n.timing);
  const values = {
    id,
    workspaceId: n.ws.id,
    clientId: n.clientId,
    membershipId: n.membershipId,
    serviceId: n.service.id,
    serviceName: n.service.name,
    startsAt: n.startsAt,
    endsAt: new Date(n.startsAt.getTime() + length * 60_000),
    ...n.timing,
    priceCents: n.priceCents,
    status: "booked" as const,
    source: n.source,
    clientNote: n.clientNote ?? null,
    staffNote: n.staffNote ?? null,
    manageTokenHash: token ? hashToken(token) : null,
    createdBy: n.createdBy,
  };
  const d = db();
  try {
    await d.batch([
      d.insert(appointments).values(values),
      d.insert(appointmentSegments).values(segmentRows(n.ws.id, id, n.membershipId, n.startsAt, n.timing, n.allowOverlap)),
      d.insert(auditLog).values(auditRow(n.actor, "appointment", id, "booked", undefined, { startsAt: n.startsAt, membershipId: n.membershipId, service: n.service.name, source: n.source })),
    ]);
  } catch (e) {
    if (isOverlapError(e)) throw new Error(TAKEN_MESSAGE);
    throw e;
  }
  return { id, token, values };
}

/** Reasons a staff-entered time might be a mistake, so the person can confirm "Book anyway". */
export function conflictsAt(plan: DayPlan, membershipId: string, start: Date, timing: ServiceTiming, tz: string): string[] {
  const out: string[] = [];
  const segs = busySegments(start.getTime(), timing);
  const appts = plan.appointmentBusy[membershipId] ?? [];
  if (segs.some((s) => appts.some((b) => overlaps(s, b)))) out.push("overlaps another appointment");
  if (segs.some((s) => (plan.timeOff[membershipId] ?? []).some((b) => overlaps(s, b)))) out.push("is during approved time off");
  const local = utcToZoned(start, tz);
  const endMin = local.minutes + serviceLength(timing);
  const inHours = (plan.staffWindows[membershipId] ?? []).some((w) => local.minutes >= w.start && endMin <= w.end);
  if (!inHours) out.push("is outside their working hours");
  return out;
}

const staffBookInput = z.object({
  clientId: z.uuid({ message: "Pick a client" }),
  serviceId: z.uuid({ message: "Pick a service" }),
  membershipId: z.uuid({ message: "Pick who it is with" }),
  day: ymd,
  time: z.string(),
  staffNote: z.string().trim().max(2000).optional(),
  force: z.coerce.boolean().default(false),
  notifyClient: z.coerce.boolean().default(true),
});

export class ConflictError extends Error {}

/** Staff books an appointment from the calendar. */
export async function bookByStaff(ctx: Ctx, raw: unknown) {
  const v = staffBookInput.parse(raw);
  if (!canManageStaff(ctx, v.membershipId)) throw new ForbiddenError("You can only book on your own calendar.");
  const minutes = parseHm(v.time);
  if (minutes == null) throw new Error("Pick a start time.");
  const ws = ctx.workspace;
  const [catalog, members] = await Promise.all([loadCatalog(ws.id), loadMembers(ws.id)]);
  const service = catalog.services.find((s) => s.id === v.serviceId);
  if (!service) throw new Error("That service is not available.");
  const staff = members.find((m) => m.membershipId === v.membershipId);
  if (!staff) throw new Error("That person is not on this team.");
  const [client] = await db().select().from(clients).where(and(eq(clients.id, v.clientId), eq(clients.workspaceId, ws.id), isNull(clients.deletedAt)));
  if (!client) throw new Error("That client was not found.");

  const { timing, priceCents } = timingFor(service, catalog.overrides.find((o) => o.serviceId === service.id && o.membershipId === staff.membershipId));
  const startsAt = zonedToUtc(v.day, minutes, ws.timezone);
  const plan = await loadDayPlan(ws, v.day, [staff.membershipId]);
  const problems = conflictsAt(plan, staff.membershipId, startsAt, timing, ws.timezone);
  if (problems.length && !v.force) throw new ConflictError(`This time ${problems.join(" and ")}. Tick "Book anyway" to keep it.`);

  const res = await insertAppointment({
    ws,
    clientId: client.id,
    membershipId: staff.membershipId,
    service,
    timing,
    priceCents,
    startsAt,
    source: "staff",
    staffNote: v.staffNote || null,
    createdBy: ctx.userId,
    allowOverlap: problems.includes("overlaps another appointment"),
    actor: actorOf(ctx),
    withManageToken: Boolean(client.email),
  });
  if (v.notifyClient && client.email) {
    await sendConfirmation(client.email, client.firstName, { serviceName: service.name, startsAt, priceCents, staffName: staff.name }, mailBusiness(ws), res.token);
  }
  return { message: `Booked ${clientName(client)}.`, id: res.id };
}

async function loadOwned(ctx: Ctx, id: string) {
  const [a] = await db().select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.workspaceId, ctx.workspace.id), isNull(appointments.deletedAt)));
  if (!a) throw new NotFoundError("That appointment was not found.");
  if (!canManageStaff(ctx, a.membershipId)) throw new ForbiddenError("You can only change appointments on your own calendar.");
  return a;
}

const rescheduleInput = z.object({
  id: z.uuid(),
  membershipId: z.uuid(),
  day: ymd,
  time: z.string(),
  force: z.coerce.boolean().default(false),
  notifyClient: z.coerce.boolean().default(true),
});

/** Moves an appointment to a new time or person. Keeps the timing and price it was booked with. */
export async function rescheduleByStaff(ctx: Ctx, raw: unknown) {
  const v = rescheduleInput.parse(raw);
  const a = await loadOwned(ctx, v.id);
  if (!canManageStaff(ctx, v.membershipId)) throw new ForbiddenError("You can only move appointments onto your own calendar.");
  if (!HOLDING_STATUSES.includes(a.status) || a.status === "completed") throw new Error("Only upcoming appointments can be moved.");
  const minutes = parseHm(v.time);
  if (minutes == null) throw new Error("Pick a start time.");
  const members = await loadMembers(ctx.workspace.id);
  const staff = members.find((m) => m.membershipId === v.membershipId);
  if (!staff) throw new Error("That person is not on this team.");
  const startsAt = zonedToUtc(v.day, minutes, ctx.workspace.timezone);
  const timing = timingOf(a);
  const plan = await loadDayPlan(ctx.workspace, v.day, [staff.membershipId], a.id);
  const problems = conflictsAt(plan, staff.membershipId, startsAt, timing, ctx.workspace.timezone);
  if (problems.length && !v.force) throw new ConflictError(`This time ${problems.join(" and ")}. Tick "Book anyway" to keep it.`);
  await moveAppointment(a, { membershipId: staff.membershipId, startsAt, allowOverlap: problems.includes("overlaps another appointment"), actor: actorOf(ctx) });

  if (v.notifyClient && (a.startsAt.getTime() !== startsAt.getTime() || a.membershipId !== staff.membershipId)) {
    const [c] = await db().select().from(clients).where(eq(clients.id, a.clientId));
    if (c?.email) {
      // A fresh manage link, since the old one may have been shared.
      const token = newToken();
      await db().update(appointments).set({ manageTokenHash: hashToken(token) }).where(eq(appointments.id, a.id));
      await sendRescheduled(c.email, c.firstName, { serviceName: a.serviceName, startsAt, priceCents: a.priceCents, staffName: staff.name }, mailBusiness(ctx.workspace), token);
    }
  }
  return { message: "Appointment moved." };
}

/** Rewrites the appointment and its segments in one transaction. */
export async function moveAppointment(a: Appointment, to: { membershipId: string; startsAt: Date; allowOverlap: boolean; actor: AuditActor }) {
  const timing = timingOf(a);
  const endsAt = new Date(to.startsAt.getTime() + serviceLength(timing) * 60_000);
  const d = db();
  try {
    await d.batch([
      d.delete(appointmentSegments).where(eq(appointmentSegments.appointmentId, a.id)),
      d.update(appointments).set({ membershipId: to.membershipId, startsAt: to.startsAt, endsAt, reminderSentAt: null }).where(eq(appointments.id, a.id)),
      d.insert(appointmentSegments).values(segmentRows(a.workspaceId, a.id, to.membershipId, to.startsAt, timing, to.allowOverlap)),
      d.insert(auditLog).values(auditRow(to.actor, "appointment", a.id, "moved", { startsAt: a.startsAt, membershipId: a.membershipId }, { startsAt: to.startsAt, membershipId: to.membershipId })),
    ]);
  } catch (e) {
    if (isOverlapError(e)) throw new Error(TAKEN_MESSAGE);
    throw e;
  }
}

const statusInput = z.object({ id: z.uuid(), status: z.enum(APPOINTMENT_STATUSES), notifyClient: z.coerce.boolean().default(true) });

export async function setStatus(ctx: Ctx, raw: unknown) {
  const v = statusInput.parse(raw);
  const a = await loadOwned(ctx, v.id);
  if (a.status === v.status) return { message: "No change." };
  await changeStatus(a, v.status, actorOf(ctx), "staff");
  if (v.status === "cancelled" && v.notifyClient && a.startsAt > new Date()) {
    const [c] = await db().select().from(clients).where(eq(clients.id, a.clientId));
    const [s] = await db().select({ name: user.name }).from(memberships).innerJoin(user, eq(user.id, memberships.userId)).where(eq(memberships.id, a.membershipId));
    if (c?.email) await sendCancelled(c.email, c.firstName, { serviceName: a.serviceName, startsAt: a.startsAt, priceCents: a.priceCents, staffName: s?.name ?? "" }, mailBusiness(ctx.workspace));
  }
  return { message: STATUS_MESSAGES[v.status] };
}

const STATUS_MESSAGES: Record<AppointmentStatus, string> = {
  booked: "Back on the books.",
  confirmed: "Marked confirmed.",
  checked_in: "Checked in.",
  completed: "Marked complete.",
  cancelled: "Cancelled. That time is open again.",
  no_show: "Marked as a no show. That time is open again.",
};

/** Cancelled and no-show appointments free their time. Bringing one back re-checks for overlaps. */
export async function changeStatus(a: Appointment, status: AppointmentStatus, actor: AuditActor, by: "staff" | "client") {
  const freeing = status === "cancelled" || status === "no_show";
  const wasHolding = HOLDING_STATUSES.includes(a.status);
  const d = db();
  const ops = [
    d
      .update(appointments)
      .set({ status, ...(status === "cancelled" ? { cancelledAt: new Date(), cancelledBy: by } : {}), ...(status !== "cancelled" && a.status === "cancelled" ? { cancelledAt: null, cancelledBy: null } : {}) })
      .where(eq(appointments.id, a.id)),
    d.insert(auditLog).values(auditRow(actor, "appointment", a.id, `status_${status}`, { status: a.status }, { status })),
  ];
  try {
    if (freeing && wasHolding) await batch([d.delete(appointmentSegments).where(eq(appointmentSegments.appointmentId, a.id)), ...ops]);
    else if (!freeing && !wasHolding) await batch([d.insert(appointmentSegments).values(segmentRows(a.workspaceId, a.id, a.membershipId, a.startsAt, timingOf(a), false)), ...ops]);
    else await batch(ops);
  } catch (e) {
    if (isOverlapError(e)) throw new Error("That time has been booked since. Move the appointment instead.");
    throw e;
  }
}

export async function saveStaffNote(ctx: Ctx, raw: unknown) {
  const v = z.object({ id: z.uuid(), staffNote: z.string().trim().max(2000) }).parse(raw);
  await loadOwned(ctx, v.id);
  await db().update(appointments).set({ staffNote: v.staffNote || null }).where(eq(appointments.id, v.id));
  return { message: "Note saved." };
}

export interface CalendarItem {
  id: string;
  membershipId: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  activeBefore: number;
  processing: number;
  activeAfter: number;
  bufferAfter: number;
  priceCents: number;
  status: AppointmentStatus;
  source: "online" | "staff";
  clientNote: string | null;
  staffNote: string | null;
}

/** Calendar data for one local day: columns, hours, time off and appointments. */
export async function loadCalendarDay(ctx: Ctx, day: string) {
  const ws = ctx.workspace;
  const members = (await loadMembers(ws.id)).filter((m) => m.bookable);
  const ids = members.map((m) => m.membershipId);
  const { from, to } = dayBounds(day, ws.timezone);
  const [plan, rows] = await Promise.all([
    loadDayPlan(ws, day, ids),
    db()
      .select({ a: appointments, c: clients })
      .from(appointments)
      .innerJoin(clients, eq(clients.id, appointments.clientId))
      .where(and(eq(appointments.workspaceId, ws.id), isNull(appointments.deletedAt), lt(appointments.startsAt, to), gt(appointments.endsAt, from)))
      .orderBy(asc(appointments.startsAt)),
  ]);
  const items: CalendarItem[] = rows.map(({ a, c }) => ({
    id: a.id,
    membershipId: a.membershipId,
    clientId: c.id,
    clientName: clientName(c),
    clientPhone: c.phone ? formatPhone(c.phone) : null,
    clientEmail: c.email,
    serviceName: a.serviceName,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    activeBefore: a.activeBefore,
    processing: a.processing,
    activeAfter: a.activeAfter,
    bufferAfter: a.bufferAfter,
    priceCents: a.priceCents,
    status: a.status,
    source: a.source,
    clientNote: a.clientNote,
    staffNote: a.staffNote,
  }));
  return {
    day,
    members,
    plan,
    items,
    canEditAll: isManager(ctx.role),
  };
}

/** Upcoming appointments for one staff member (their own "My day" list). */
export async function upcomingFor(ctx: Ctx, membershipId: string, days = 7) {
  const { from } = dayBounds(ctx.today, ctx.workspace.timezone);
  const to = dayBounds(addDays(ctx.today, days), ctx.workspace.timezone).to;
  const rows = await db()
    .select({ a: appointments, c: clients })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .where(
      and(
        eq(appointments.workspaceId, ctx.workspace.id),
        eq(appointments.membershipId, membershipId),
        isNull(appointments.deletedAt),
        inArray(appointments.status, ["booked", "confirmed", "checked_in"]),
        gt(appointments.startsAt, from),
        lt(appointments.startsAt, to),
      ),
    )
    .orderBy(asc(appointments.startsAt));
  return rows.map(({ a, c }) => ({ ...a, clientName: clientName(c) }));
}
