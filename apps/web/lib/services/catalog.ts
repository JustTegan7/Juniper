import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLog, serviceCategories, services, staffServices } from "@evergreen/db";
import { parsePrice, type ServiceTiming } from "@evergreen/core";
import { batch, db } from "../db";
import { auditRow } from "../audit";
import { actorOf, requireManager, type Ctx } from "./ctx";
import { loadMembers } from "./workspace";

export type Service = typeof services.$inferSelect;
export type Category = typeof serviceCategories.$inferSelect;

export interface Catalog {
  categories: Category[];
  services: Service[];
  /** serviceId to the staff (membership ids) who perform it. An empty list means every bookable staff member. */
  staffFor: Record<string, string[]>;
  overrides: (typeof staffServices.$inferSelect)[];
}

export async function loadCatalog(workspaceId: string, opts: { includeInactive?: boolean } = {}): Promise<Catalog> {
  const d = db();
  const [cats, svcs, links] = await Promise.all([
    d.select().from(serviceCategories).where(and(eq(serviceCategories.workspaceId, workspaceId), isNull(serviceCategories.deletedAt))).orderBy(asc(serviceCategories.sortOrder), asc(serviceCategories.name)),
    d
      .select()
      .from(services)
      .where(and(eq(services.workspaceId, workspaceId), isNull(services.deletedAt), ...(opts.includeInactive ? [] : [eq(services.active, true)])))
      .orderBy(asc(services.sortOrder), asc(services.name)),
    d.select().from(staffServices).where(and(eq(staffServices.workspaceId, workspaceId), isNull(staffServices.deletedAt))),
  ]);
  const staffFor: Record<string, string[]> = {};
  for (const s of svcs) staffFor[s.id] = [];
  for (const l of links) staffFor[l.serviceId]?.push(l.membershipId);
  return { categories: cats, services: svcs, staffFor, overrides: links };
}

/** The timing and price one staff member uses for a service (their own overrides first). */
export function timingFor(service: Service, override?: typeof staffServices.$inferSelect | null): { timing: ServiceTiming; priceCents: number } {
  return {
    timing: {
      activeBefore: override?.activeBefore ?? service.activeBefore,
      processing: override?.processing ?? service.processing,
      activeAfter: override?.activeAfter ?? service.activeAfter,
      bufferAfter: service.bufferAfter,
    },
    priceCents: override?.priceCents ?? service.priceCents,
  };
}

/** Staff who can perform a service: the assigned ones, or every bookable person when nobody is assigned. */
export function performers(catalog: Catalog, serviceId: string, bookableIds: string[]): string[] {
  const assigned = catalog.staffFor[serviceId] ?? [];
  return assigned.length ? bookableIds.filter((id) => assigned.includes(id)) : bookableIds;
}

const minutes = z.coerce.number().int().min(0).max(600);

const serviceInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Name the service").max(100),
  description: z.string().trim().max(1000).optional().transform((v) => v || null),
  categoryId: z.string().optional().transform((v) => (v && v !== "none" ? v : null)),
  activeBefore: minutes,
  processing: minutes.default(0),
  activeAfter: minutes.default(0),
  bufferAfter: minutes.default(0),
  price: z.string().default("0"),
  priceFrom: z.coerce.boolean().default(false),
  bookableOnline: z.coerce.boolean().default(false),
  active: z.coerce.boolean().default(true),
  staff: z.array(z.uuid()).default([]),
});

export async function saveService(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const input = serviceInput.parse(raw);
  const priceCents = parsePrice(input.price);
  if (priceCents == null) throw new Error("Check the price.");
  if (input.activeBefore + input.processing + input.activeAfter <= 0) throw new Error("Give the service some time.");
  if (input.categoryId) {
    const [c] = await db().select({ id: serviceCategories.id }).from(serviceCategories).where(and(eq(serviceCategories.id, input.categoryId), eq(serviceCategories.workspaceId, ctx.workspace.id)));
    if (!c) throw new Error("Pick a category from the list.");
  }
  const members = await loadMembers(ctx.workspace.id);
  const validStaff = input.staff.filter((id) => members.some((m) => m.membershipId === id));

  const values = {
    workspaceId: ctx.workspace.id,
    name: input.name,
    description: input.description,
    categoryId: input.categoryId,
    activeBefore: input.activeBefore,
    processing: input.processing,
    activeAfter: input.activeAfter,
    bufferAfter: input.bufferAfter,
    priceCents,
    priceFrom: input.priceFrom,
    bookableOnline: input.bookableOnline,
    active: input.active,
  };

  const d = db();
  let id = input.id;
  if (id) {
    const [before] = await d.select().from(services).where(and(eq(services.id, id), eq(services.workspaceId, ctx.workspace.id), isNull(services.deletedAt)));
    if (!before) throw new Error("That service was not found.");
    const existing = await d.select().from(staffServices).where(and(eq(staffServices.serviceId, id), isNull(staffServices.deletedAt)));
    const keep = new Set(validStaff);
    const removeIds = existing.filter((e) => !keep.has(e.membershipId)).map((e) => e.id);
    const add = validStaff.filter((m) => !existing.some((e) => e.membershipId === m));
    await batch([
      d.update(services).set(values).where(eq(services.id, id)),
      ...(removeIds.length ? [d.delete(staffServices).where(inArray(staffServices.id, removeIds))] : []),
      ...(add.length ? [d.insert(staffServices).values(add.map((membershipId) => ({ workspaceId: ctx.workspace.id, membershipId, serviceId: id! })))] : []),
      d.insert(auditLog).values(auditRow(actorOf(ctx), "service", id, "updated", before, values)),
    ]);
  } else {
    const [{ n }] = await d.select({ n: sql<number>`coalesce(max(${services.sortOrder}), 0)` }).from(services).where(eq(services.workspaceId, ctx.workspace.id));
    const [row] = await d.insert(services).values({ ...values, sortOrder: Number(n) + 1 }).returning({ id: services.id });
    id = row.id;
    if (validStaff.length) await d.insert(staffServices).values(validStaff.map((membershipId) => ({ workspaceId: ctx.workspace.id, membershipId, serviceId: id! })));
  }
  return { message: "Service saved.", id };
}

export async function archiveService(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const { id } = z.object({ id: z.uuid() }).parse(raw);
  await db().update(services).set({ deletedAt: new Date(), active: false }).where(and(eq(services.id, id), eq(services.workspaceId, ctx.workspace.id)));
  return { message: "Service removed. Past appointments keep their details." };
}

export async function saveCategory(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const input = z.object({ id: z.uuid().optional(), name: z.string().trim().min(1, "Name the category").max(60) }).parse(raw);
  if (input.id) {
    await db().update(serviceCategories).set({ name: input.name }).where(and(eq(serviceCategories.id, input.id), eq(serviceCategories.workspaceId, ctx.workspace.id)));
  } else {
    const count = await db().select({ id: serviceCategories.id }).from(serviceCategories).where(eq(serviceCategories.workspaceId, ctx.workspace.id));
    await db().insert(serviceCategories).values({ workspaceId: ctx.workspace.id, name: input.name, sortOrder: count.length });
  }
  return { message: "Category saved." };
}

export async function deleteCategory(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const { id } = z.object({ id: z.uuid() }).parse(raw);
  const d = db();
  await batch([
    d.update(services).set({ categoryId: null }).where(and(eq(services.categoryId, id), eq(services.workspaceId, ctx.workspace.id))),
    d.update(serviceCategories).set({ deletedAt: new Date() }).where(and(eq(serviceCategories.id, id), eq(serviceCategories.workspaceId, ctx.workspace.id))),
  ]);
  return { message: "Category removed. Its services are now uncategorized." };
}

/** Per-person price and timing for one service (senior stylists charging more, for example). */
export async function saveStaffOverride(ctx: Ctx, raw: unknown) {
  requireManager(ctx);
  const opt = z.string().optional().transform((v) => (v === undefined || v.trim() === "" ? null : v.trim()));
  const input = z.object({ serviceId: z.uuid(), membershipId: z.uuid(), price: opt, activeBefore: opt, processing: opt, activeAfter: opt }).parse(raw);
  const num = (v: string | null) => {
    if (v == null) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 600) throw new Error("Use whole minutes.");
    return n;
  };
  const priceCents = input.price == null ? null : parsePrice(input.price);
  if (input.price != null && priceCents == null) throw new Error("Check the price.");
  const values = { priceCents, activeBefore: num(input.activeBefore), processing: num(input.processing), activeAfter: num(input.activeAfter) };
  const [svc] = await db().select({ id: services.id }).from(services).where(and(eq(services.id, input.serviceId), eq(services.workspaceId, ctx.workspace.id)));
  if (!svc) throw new Error("That service was not found.");
  const members = await loadMembers(ctx.workspace.id);
  if (!members.some((m) => m.membershipId === input.membershipId)) throw new Error("That person is not on this team.");
  await db()
    .insert(staffServices)
    .values({ workspaceId: ctx.workspace.id, serviceId: input.serviceId, membershipId: input.membershipId, ...values })
    .onConflictDoUpdate({ target: [staffServices.membershipId, staffServices.serviceId], set: { ...values, deletedAt: null } });
  return { message: "Saved." };
}
