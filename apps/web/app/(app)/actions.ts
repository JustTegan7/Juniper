"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { toResult, type ActionResult } from "../../lib/action-result";
import { ACTIVE_WORKSPACE_COOKIE, getCtx, type Ctx } from "../../lib/services/ctx";
import * as appts from "../../lib/services/appointments";
import * as catalog from "../../lib/services/catalog";
import * as clients from "../../lib/services/clients";
import * as hours from "../../lib/services/hours";
import * as settings from "../../lib/services/settings";
import * as team from "../../lib/services/team";
import * as clock from "../../lib/services/timeclock";
import * as timeoff from "../../lib/services/timeoff";

// Thin wrappers: build ctx, call a service, refresh the pages.
export type { ActionResult };

async function run(fn: (ctx: Ctx) => Promise<{ message: string; id?: string; data?: string }>): Promise<ActionResult> {
  const ctx = await getCtx();
  return toResult(() => fn(ctx));
}

// Team
export const setTemporaryPasswordAction = async (input: unknown) => run((c) => team.setTemporaryPassword(c, input));
export const inviteAction = async (input: unknown) => run((c) => team.createInvite(c, input));
export const revokeInviteAction = async (input: unknown) => run((c) => team.revokeInvite(c, input));
export const updateMemberAction = async (input: unknown) => run((c) => team.updateMember(c, input));
export const removeMemberAction = async (input: unknown) => run((c) => team.removeMember(c, input));

// Services menu
export const saveServiceAction = async (input: unknown) => run((c) => catalog.saveService(c, input));
export const archiveServiceAction = async (input: unknown) => run((c) => catalog.archiveService(c, input));
export const saveCategoryAction = async (input: unknown) => run((c) => catalog.saveCategory(c, input));
export const deleteCategoryAction = async (input: unknown) => run((c) => catalog.deleteCategory(c, input));
export const saveStaffOverrideAction = async (input: unknown) => run((c) => catalog.saveStaffOverride(c, input));

// Hours
export const saveBusinessHoursAction = async (input: unknown) => run((c) => hours.saveBusinessHours(c, input));
export const saveStaffHoursAction = async (input: unknown) => run((c) => hours.saveStaffHours(c, input));
export const saveOverrideAction = async (input: unknown) => run((c) => hours.saveOverride(c, input));
export const deleteOverrideAction = async (input: unknown) => run((c) => hours.deleteOverride(c, input));

// Clients
export const saveClientAction = async (input: unknown) => run((c) => clients.saveClient(c, input));
export const archiveClientAction = async (input: unknown) => run((c) => clients.archiveClient(c, input));
export async function searchClientsAction(q: string) {
  const ctx = await getCtx();
  const rows = await clients.searchClients(ctx, String(q ?? "").slice(0, 100), 12);
  return rows.map((r) => ({ id: r.id, name: clients.clientName(r), email: r.email, phone: clients.formatPhone(r.phone) }));
}

// Appointments
export const bookAction = async (input: unknown) => run((c) => appts.bookByStaff(c, input));
export const rescheduleAction = async (input: unknown) => run((c) => appts.rescheduleByStaff(c, input));
export const setStatusAction = async (input: unknown) => run((c) => appts.setStatus(c, input));
export const saveStaffNoteAction = async (input: unknown) => run((c) => appts.saveStaffNote(c, input));

/** Open times for the booking dialog (staff side: working hours, no lead time). */
export async function staffSlotsAction(input: { serviceId: string; membershipId: string; day: string; excludeAppointmentId?: string }) {
  const ctx = await getCtx();
  const res = await appts.availability(ctx.workspace, { serviceId: input.serviceId, staffId: input.membershipId, day: input.day, now: new Date(0), online: false, excludeAppointmentId: input.excludeAppointmentId });
  return res?.slots[0]?.starts ?? [];
}

// Time clock
export const clockInAction = async () => run((c) => clock.clockIn(c));
export const clockOutAction = async () => run((c) => clock.clockOut(c));
export const startBreakAction = async (input: unknown) => run((c) => clock.startBreak(c, input));
export const endBreakAction = async () => run((c) => clock.endBreak(c));
export const saveEntryAction = async (input: unknown) => run((c) => clock.saveEntry(c, input));
export const deleteEntryAction = async (input: unknown) => run((c) => clock.deleteEntry(c, input));

// Time off
export const requestTimeOffAction = async (input: unknown) => run((c) => timeoff.requestTimeOff(c, input));
export const reviewTimeOffAction = async (input: unknown) => run((c) => timeoff.reviewTimeOff(c, input));
export const cancelTimeOffAction = async (input: unknown) => run((c) => timeoff.cancelTimeOff(c, input));

// Settings
export const updateBusinessAction = async (input: unknown) => run((c) => settings.updateBusiness(c, input));
export const updateSettingsAction = async (input: unknown) => run((c) => settings.updateSettings(c, input));

/** Switch which business the app shows. Only to businesses the person belongs to. */
export async function switchWorkspaceAction(workspaceId: string) {
  const ctx = await getCtx();
  if (!ctx.workspaces.some((w) => w.id === workspaceId)) return { ok: false, error: "You are not on that team." } as ActionResult;
  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return { ok: true, message: "Switched." } as ActionResult;
}
