import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { auditLog, businessHours, staffHourOverrides, staffHours } from "@evergreen/db";
import { parseHm, ymd, type HoursOverride, type WeeklyHours } from "@evergreen/core";
import { batch, db } from "../db";
import { auditRow } from "../audit";
import { actorOf, canManageStaff, ForbiddenError, requireManager, type Ctx } from "./ctx";
import { loadMembers } from "./workspace";

/** One weekday's windows as "HH:MM-HH:MM" pairs from a form. */
const windowList = z.array(z.object({ weekday: z.coerce.number().int().min(0).max(6), start: z.string(), end: z.string() }));

function toRows(list: z.infer<typeof windowList>) {
  return list
    .filter((w) => w.start && w.end)
    .map((w) => {
      const start = parseHm(w.start);
      const end = parseHm(w.end);
      if (start == null || end == null) throw new Error("Check the times.");
      if (end <= start) throw new Error("Each closing time must be after its opening time.");
      return { weekday: w.weekday, startMin: start, endMin: end };
    });
}

export async function loadBusinessHours(workspaceId: string): Promise<WeeklyHours[]> {
  const rows = await db().select().from(businessHours).where(and(eq(businessHours.workspaceId, workspaceId), isNull(businessHours.deletedAt))).orderBy(asc(businessHours.weekday), asc(businessHours.startMin));
  return rows.map((r) => ({ weekday: r.weekday, start: r.startMin, end: r.endMin }));
}

export async function saveBusinessHours(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const rows = toRows(windowList.parse(raw));
  const d = db();
  await batch([
    d.delete(businessHours).where(eq(businessHours.workspaceId, ctx.workspace.id)),
    ...(rows.length ? [d.insert(businessHours).values(rows.map((r) => ({ ...r, workspaceId: ctx.workspace.id })))] : []),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "business_hours", ctx.workspace.id, "updated", undefined, rows)),
  ]);
  return { message: "Business hours saved." };
}

export async function loadStaffHours(workspaceId: string, membershipIds?: string[]) {
  const rows = await db()
    .select()
    .from(staffHours)
    .where(and(eq(staffHours.workspaceId, workspaceId), isNull(staffHours.deletedAt), ...(membershipIds ? [inArray(staffHours.membershipId, membershipIds.length ? membershipIds : ["00000000-0000-0000-0000-000000000000"])] : [])))
    .orderBy(asc(staffHours.weekday), asc(staffHours.startMin));
  const out: Record<string, WeeklyHours[]> = {};
  for (const r of rows) (out[r.membershipId] ??= []).push({ weekday: r.weekday, start: r.startMin, end: r.endMin });
  return out;
}

export async function loadOverrides(workspaceId: string, from: string, to: string, membershipIds?: string[]) {
  const rows = await db()
    .select()
    .from(staffHourOverrides)
    .where(
      and(
        eq(staffHourOverrides.workspaceId, workspaceId),
        isNull(staffHourOverrides.deletedAt),
        gte(staffHourOverrides.day, from),
        lte(staffHourOverrides.day, to),
        ...(membershipIds ? [inArray(staffHourOverrides.membershipId, membershipIds.length ? membershipIds : ["00000000-0000-0000-0000-000000000000"])] : []),
      ),
    )
    .orderBy(asc(staffHourOverrides.day));
  const out: Record<string, (HoursOverride & { id: string; note: string | null })[]> = {};
  for (const r of rows) (out[r.membershipId] ??= []).push({ id: r.id, day: r.day, start: r.startMin, end: r.endMin, note: r.note });
  return out;
}

async function assertMember(ctx: Ctx, membershipId: string) {
  if (!canManageStaff(ctx, membershipId)) throw new ForbiddenError("You can only change your own schedule.");
  const members = await loadMembers(ctx.workspace.id);
  if (!members.some((m) => m.membershipId === membershipId)) throw new Error("That person is not on this team.");
}

/** Replaces someone's usual weekly schedule. Managers set anyone's; team members their own. */
export async function saveStaffHours(ctx: Ctx, raw: unknown) {
  const input = z.object({ membershipId: z.uuid(), windows: windowList }).parse(raw);
  requireManager(ctx);
  await assertMember(ctx, input.membershipId);
  const rows = toRows(input.windows);
  const d = db();
  await batch([
    d.delete(staffHours).where(and(eq(staffHours.workspaceId, ctx.workspace.id), eq(staffHours.membershipId, input.membershipId))),
    ...(rows.length ? [d.insert(staffHours).values(rows.map((r) => ({ ...r, workspaceId: ctx.workspace.id, membershipId: input.membershipId })))] : []),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "staff_hours", input.membershipId, "updated", undefined, rows)),
  ]);
  return { message: "Schedule saved." };
}

/** A one-day change: different hours, or off. Replaces any earlier change for that day. */
export async function saveOverride(ctx: Ctx, raw: unknown) {
  const input = z
    .object({ membershipId: z.uuid(), day: ymd, off: z.coerce.boolean().default(false), start: z.string().optional(), end: z.string().optional(), note: z.string().trim().max(200).optional() })
    .parse(raw);
  requireManager(ctx);
  await assertMember(ctx, input.membershipId);
  let startMin: number | null = null;
  let endMin: number | null = null;
  if (!input.off) {
    startMin = parseHm(input.start ?? "");
    endMin = parseHm(input.end ?? "");
    if (startMin == null || endMin == null || endMin <= startMin) throw new Error("Add a start and end time, or mark the day off.");
  }
  const d = db();
  await batch([
    d.delete(staffHourOverrides).where(and(eq(staffHourOverrides.membershipId, input.membershipId), eq(staffHourOverrides.day, input.day))),
    d.insert(staffHourOverrides).values({ workspaceId: ctx.workspace.id, membershipId: input.membershipId, day: input.day, startMin, endMin, note: input.note || null }),
  ]);
  return { message: input.off ? "Marked off for that day." : "Hours changed for that day." };
}

export async function deleteOverride(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const { id } = z.object({ id: z.uuid() }).parse(raw);
  await db().delete(staffHourOverrides).where(and(eq(staffHourOverrides.id, id), eq(staffHourOverrides.workspaceId, ctx.workspace.id)));
  return { message: "Back to the usual schedule for that day." };
}
