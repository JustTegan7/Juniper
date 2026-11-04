import "server-only";
import { count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { appointments, clients, memberships, services, timeEntries, workspaces } from "@evergreen/db";
import { batch, db } from "../db";
import { isPlatformAdmin } from "../platform";

/** Who is asking. Built by the admin server action from the signed-in session. */
export interface AdminCtx {
  userId: string;
  email: string;
}

export class NotPlatformAdminError extends Error {
  constructor() {
    super("Only Juniper admins can do that.");
  }
}

/** The service layer checks this itself, so no caller can skip it. */
export function assertPlatformAdmin(ctx: AdminCtx) {
  if (!isPlatformAdmin(ctx.email)) throw new NotPlatformAdminError();
}

export interface BusinessCounts {
  appointments: number;
  clients: number;
  staff: number;
  timeEntries: number;
  services: number;
}

const EMPTY: BusinessCounts = { appointments: 0, clients: 0, staff: 0, timeEntries: 0, services: 0 };

/** Counts everything stored for a business, including soft deleted rows, since a delete removes those too. */
async function countsFor(workspaceIds: string[]): Promise<Map<string, BusinessCounts>> {
  const out = new Map(workspaceIds.map((id) => [id, { ...EMPTY }]));
  if (!workspaceIds.length) return out;
  const d = db();
  const tables = [
    ["appointments", appointments],
    ["clients", clients],
    ["staff", memberships],
    ["timeEntries", timeEntries],
    ["services", services],
  ] as const;
  const results = await Promise.all(
    tables.map(([, t]) =>
      d.select({ workspaceId: t.workspaceId, n: count() }).from(t).where(inArray(t.workspaceId, workspaceIds)).groupBy(t.workspaceId),
    ),
  );
  results.forEach((rows, i) => {
    const key = tables[i][0];
    for (const r of rows) {
      const c = out.get(r.workspaceId);
      if (c) c[key] = Number(r.n);
    }
  });
  return out;
}

/** What a delete would remove, for every business. Shown in the confirmation. Platform admins only. */
export async function loadBusinessCounts(ctx: AdminCtx): Promise<Record<string, BusinessCounts>> {
  assertPlatformAdmin(ctx);
  const ids = (await db().select({ id: workspaces.id }).from(workspaces)).map((r) => r.id);
  return Object.fromEntries(await countsFor(ids));
}

export const deleteBusinessInput = z.object({
  workspaceId: z.uuid(),
  /** The business's link name, typed by the admin. Must match exactly. */
  confirmSlug: z.string(),
  /** Ticked when the business has appointments or time entries. */
  acknowledgeData: z.boolean().default(false),
});

/**
 * Permanently deletes one business and everything in it, in one transaction.
 *
 * Every table keyed by workspace_id cascades from the workspaces row. Appointments
 * point at clients and staff with ON DELETE RESTRICT, so they go first in the same
 * batch. Nothing outside this workspace_id is touched: login accounts stay (a person
 * may belong to other businesses), and other businesses' rows are never referenced.
 * The workspaces row is removed (not soft deleted) so the link name can be reused.
 *
 * The business's own audit rows are deleted with it, so the record of this delete is
 * a structured log line instead.
 */
export async function deleteBusiness(ctx: AdminCtx, raw: unknown) {
  assertPlatformAdmin(ctx);
  const input = deleteBusinessInput.parse(raw);
  const d = db();

  const [ws] = await d.select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug }).from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1);
  if (!ws) throw new Error("That business no longer exists.");
  if (input.confirmSlug.trim() !== ws.slug) throw new Error("The link name does not match, so nothing was deleted.");

  const counts = (await countsFor([ws.id])).get(ws.id) ?? { ...EMPTY };
  if ((counts.appointments > 0 || counts.timeEntries > 0) && !input.acknowledgeData) {
    throw new Error("This business has appointments or time entries. Tick the box to confirm they will be lost.");
  }

  await batch([d.delete(appointments).where(eq(appointments.workspaceId, ws.id)), d.delete(workspaces).where(eq(workspaces.id, ws.id))]);

  console.warn(JSON.stringify({ event: "business_deleted", by: ctx.userId, workspaceId: ws.id, name: ws.name, slug: ws.slug, counts, at: new Date().toISOString() }));
  return { name: ws.name, slug: ws.slug, counts };
}
