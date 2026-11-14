import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { auditLog, memberships, user } from "@evergreen/db";
import { parsePrice, type PayProfile } from "@evergreen/core";
import { batch, db } from "../db";
import { auditRow } from "../audit";
import { actorOf, requireRole, type Ctx } from "./ctx";

/**
 * Pay rates. Owners only, because wages are private. Juniper does not run payroll and never stores bank details:
 * rates exist so timesheets can show an estimate, and a payroll provider does the real paychecks.
 */

export interface PayRow {
  membershipId: string;
  name: string;
  profile: PayProfile | null;
}

/** Every active person's pay profile. Owners only. */
export async function listPayProfiles(ctx: Ctx): Promise<PayRow[]> {
  requireRole(ctx, ["owner"]);
  const rows = await db()
    .select({ membershipId: memberships.id, name: user.name, payType: memberships.payType, payRateCents: memberships.payRateCents })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.workspaceId, ctx.workspace.id), isNull(memberships.deletedAt)))
    .orderBy(user.name);
  return rows.map((r) => ({ membershipId: r.membershipId, name: r.name, profile: r.payType && r.payRateCents != null ? { payType: r.payType, payRateCents: r.payRateCents } : null }));
}

/** A map of membershipId to profile, for estimates. Empty unless the caller is allowed to see them. */
export async function payProfileMap(ctx: Ctx): Promise<Map<string, PayProfile>> {
  const t = ctx.workspace.settings.time;
  if (!t.showPayEstimates) return new Map();
  if (ctx.role === "owner") return new Map((await listPayProfiles(ctx)).filter((r) => r.profile).map((r) => [r.membershipId, r.profile!]));
  if (!t.employeesSeeOwnPay) return new Map();
  const [me] = await db()
    .select({ payType: memberships.payType, payRateCents: memberships.payRateCents })
    .from(memberships)
    .where(and(eq(memberships.id, ctx.membershipId), eq(memberships.workspaceId, ctx.workspace.id), isNull(memberships.deletedAt)));
  return me?.payType && me.payRateCents != null ? new Map([[ctx.membershipId, { payType: me.payType, payRateCents: me.payRateCents }]]) : new Map();
}

const saveInput = z.object({
  membershipId: z.uuid(),
  /** Empty clears the profile. */
  payType: z.enum(["hourly", "salary", ""]),
  /** Dollars. Per hour for hourly, per year for salary. */
  rate: z.string().trim().max(20).default(""),
});

export async function savePayProfile(ctx: Ctx, raw: unknown) {
  requireRole(ctx, ["owner"]);
  const v = saveInput.parse(raw);
  const d = db();
  const [m] = await d.select().from(memberships).where(and(eq(memberships.id, v.membershipId), eq(memberships.workspaceId, ctx.workspace.id), isNull(memberships.deletedAt)));
  if (!m) throw new Error("That person is not on this team.");

  let next: { payType: "hourly" | "salary" | null; payRateCents: number | null };
  if (v.payType === "") next = { payType: null, payRateCents: null };
  else {
    const cents = parsePrice(v.rate);
    if (cents === null || cents <= 0) throw new Error("Enter the rate in dollars, like 18.50.");
    if (v.payType === "hourly" && cents > 100_000) throw new Error("That hourly rate looks too high. Enter dollars per hour.");
    if (v.payType === "salary" && cents < 1_000_00) throw new Error("A yearly salary should be at least $1,000. Enter dollars per year.");
    next = { payType: v.payType, payRateCents: cents };
  }
  await batch([
    d.update(memberships).set(next).where(eq(memberships.id, m.id)),
    // The audit trail records that a rate changed, not the amounts.
    d.insert(auditLog).values(auditRow(actorOf(ctx), "member", m.id, "pay_profile_changed", { payType: m.payType }, { payType: next.payType })),
  ]);
  return { message: next.payType ? "Pay saved." : "Pay cleared." };
}
