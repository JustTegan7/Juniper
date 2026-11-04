import "server-only";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { appointments, auditLog, clients, memberships, user } from "@evergreen/db";
import { optEmail } from "@evergreen/core";
import { batch, db } from "../db";
import { auditRow } from "../audit";
import { actorOf, requireManager, type Ctx } from "./ctx";

export type Client = typeof clients.$inferSelect;

/** Digits only, so "(425) 555-0100" and "425.555.0100" match. */
export function normalizePhone(v: string | null | undefined): string | null {
  const digits = (v ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function formatPhone(v: string | null | undefined): string {
  const d = normalizePhone(v);
  if (!d) return "";
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d;
}

export function clientName(c: { firstName: string; lastName: string }) {
  return `${c.firstName} ${c.lastName}`.trim();
}

const clientInput = z.object({
  id: z.uuid().optional(),
  firstName: z.string().trim().min(1, "Add a first name").max(60),
  lastName: z.string().trim().max(60).default(""),
  email: optEmail,
  phone: z.string().trim().max(30).optional().transform((v) => normalizePhone(v)),
  notes: z.string().trim().max(4000).optional().transform((v) => v || null),
});

export async function saveClient(ctx: Ctx, raw: unknown) {
  const input = clientInput.parse(raw);
  const { id, ...values } = input;
  if (id) {
    const [before] = await db().select().from(clients).where(and(eq(clients.id, id), eq(clients.workspaceId, ctx.workspace.id), isNull(clients.deletedAt)));
    if (!before) throw new Error("That client was not found.");
    await db().update(clients).set(values).where(eq(clients.id, id));
    await db().insert(auditLog).values(auditRow(actorOf(ctx), "client", id, "updated", before, values));
    return { message: "Client saved.", id };
  }
  if (values.email) {
    const [dupe] = await db().select({ id: clients.id }).from(clients).where(and(eq(clients.workspaceId, ctx.workspace.id), eq(clients.email, values.email), isNull(clients.deletedAt))).limit(1);
    if (dupe) throw new Error("A client with that email already exists. Search for them instead.");
  }
  const [row] = await db().insert(clients).values({ ...values, workspaceId: ctx.workspace.id }).returning({ id: clients.id });
  return { message: "Client added.", id: row.id };
}

export async function archiveClient(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const { id } = z.object({ id: z.uuid() }).parse(raw);
  await db().update(clients).set({ deletedAt: new Date() }).where(and(eq(clients.id, id), eq(clients.workspaceId, ctx.workspace.id)));
  await db().insert(auditLog).values(auditRow(actorOf(ctx), "client", id, "archived"));
  return { message: "Client archived. Their past appointments are kept." };
}

export type ClientDeleteSummary = { past: number; upcoming: number; cancelled: number; total: number };

/**
 * How many appointments deleting a client would remove, scoped to this business.
 * Cancelled ones are counted on their own. "Upcoming" is not cancelled and starts now or later.
 * Soft deleted appointments still block the delete (RESTRICT key), so they are counted as well.
 */
async function deleteSummary(workspaceId: string, clientId: string, now: Date): Promise<ClientDeleteSummary> {
  const rows = await db()
    .select({ status: appointments.status, startsAt: appointments.startsAt })
    .from(appointments)
    .where(and(eq(appointments.clientId, clientId), eq(appointments.workspaceId, workspaceId)));
  const s = { past: 0, upcoming: 0, cancelled: 0, total: rows.length };
  for (const r of rows) {
    if (r.status === "cancelled") s.cancelled++;
    else if (r.startsAt.getTime() >= now.getTime()) s.upcoming++;
    else s.past++;
  }
  return s;
}

/** Owners and managers only. Feeds the delete confirmation. */
export async function getClientDeleteSummary(ctx: Ctx, raw: unknown, now: Date = new Date()) {
  requireManager(ctx);
  const { id } = z.object({ id: z.uuid() }).parse(raw);
  return deleteSummary(ctx.workspace.id, id, now);
}

const deleteClientInput = z.object({
  id: z.uuid(),
  /** Must be true when the client has upcoming appointments that are not cancelled. */
  acknowledgeUpcoming: z.boolean().default(false),
});

/**
 * Permanently deletes a client and all their appointments, in one transaction.
 *
 * Appointments point at clients with ON DELETE RESTRICT, so they go first; their busy-time
 * segments cascade from the appointment. Nothing else references a client: notes and the
 * reminder flag are columns on the client and appointment rows, and the linked login
 * (magic link account) is only a nullable pointer from the client to a shared user, so the
 * login itself stays. Every statement is filtered by ctx.workspace.id, so another business
 * can never be touched even with a guessed id. The audit row (kept) and a log line record it.
 */
export async function deleteClient(ctx: Ctx, raw: unknown, now: Date = new Date()) {
  requireManager(ctx);
  const input = deleteClientInput.parse(raw);
  const ws = ctx.workspace.id;

  const [client] = await db().select().from(clients).where(and(eq(clients.id, input.id), eq(clients.workspaceId, ws)));
  if (!client) throw new Error("That client was not found.");

  const counts = await deleteSummary(ws, client.id, now);
  if (counts.upcoming > 0 && !input.acknowledgeUpcoming) {
    throw new Error("This client has upcoming appointments. Tick the box to confirm they will be removed.");
  }

  const d = db();
  await batch([
    d.delete(appointments).where(and(eq(appointments.clientId, client.id), eq(appointments.workspaceId, ws))),
    d.delete(clients).where(and(eq(clients.id, client.id), eq(clients.workspaceId, ws))),
    d.insert(auditLog).values(auditRow(actorOf(ctx), "client", client.id, "deleted", { name: clientName(client), email: client.email, phone: client.phone }, { appointmentsRemoved: counts })),
  ]);

  console.warn(JSON.stringify({ event: "client_deleted", by: ctx.userId, workspaceId: ws, clientId: client.id, counts, at: now.toISOString() }));
  return { message: `${clientName(client)} was deleted.`, counts };
}

/** Search by name, email or phone. Empty query lists recent clients. */
export async function searchClients(ctx: Ctx, q: string, limit = 50) {
  const term = q.trim();
  const digits = normalizePhone(term);
  const where = and(
    eq(clients.workspaceId, ctx.workspace.id),
    isNull(clients.deletedAt),
    term
      ? or(
          ilike(sql`${clients.firstName} || ' ' || ${clients.lastName}`, `%${term}%`),
          ilike(clients.email, `%${term}%`),
          ...(digits && digits.length >= 3 ? [ilike(clients.phone, `%${digits}%`)] : []),
        )
      : undefined,
  );
  return db()
    .select()
    .from(clients)
    .where(where)
    .orderBy(term ? asc(clients.firstName) : desc(clients.updatedAt))
    .limit(limit);
}

export async function getClient(ctx: Ctx, id: string) {
  const [c] = await db().select().from(clients).where(and(eq(clients.id, id), eq(clients.workspaceId, ctx.workspace.id), isNull(clients.deletedAt)));
  if (!c) return null;
  const history = await db()
    .select({ a: appointments, staffName: user.name })
    .from(appointments)
    .innerJoin(memberships, eq(memberships.id, appointments.membershipId))
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(appointments.clientId, id), eq(appointments.workspaceId, ctx.workspace.id), isNull(appointments.deletedAt)))
    .orderBy(desc(appointments.startsAt))
    .limit(200);
  return { client: c, history: history.map((h) => ({ ...h.a, staffName: h.staffName })) };
}

/**
 * Finds the client for an online booking by email (then phone), or creates one.
 * Fills in a missing phone or email but never overwrites what the business has on file.
 */
export async function findOrCreateClient(workspaceId: string, v: { firstName: string; lastName: string; email: string; phone: string | null }) {
  const email = v.email.toLowerCase();
  const phone = normalizePhone(v.phone);
  const [byEmail] = await db().select().from(clients).where(and(eq(clients.workspaceId, workspaceId), eq(clients.email, email), isNull(clients.deletedAt))).limit(1);
  const found =
    byEmail ??
    (phone ? (await db().select().from(clients).where(and(eq(clients.workspaceId, workspaceId), eq(clients.phone, phone), isNull(clients.deletedAt))).limit(1))[0] : undefined);
  if (found) {
    const patch: Partial<Client> = {};
    if (!found.email) patch.email = email;
    if (!found.phone && phone) patch.phone = phone;
    if (Object.keys(patch).length) await db().update(clients).set(patch).where(eq(clients.id, found.id));
    return { ...found, ...patch };
  }
  const [row] = await db().insert(clients).values({ workspaceId, firstName: v.firstName, lastName: v.lastName, email, phone }).returning();
  return row;
}
