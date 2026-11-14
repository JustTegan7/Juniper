import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  businessHours,
  invites,
  memberships,
  serviceCategories,
  services,
  user,
  workspaces,
  uuidv7,
} from "@evergreen/db";
import { INDUSTRIES, INDUSTRY_PRESETS, slugSchema, slugify, type Industry, type Role } from "@evergreen/core";
import { batch, db } from "../db";

export const MEMBER_COLORS = ["#4F5D95", "#2F6B4F", "#C8643C", "#B07CC6", "#E8B33A", "#3F8FB0", "#B4536B", "#6C8CD5"];

export function memberColor(index: number) {
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

export const createBusinessInput = z.object({
  name: z.string().trim().min(2, "Add the business name").max(80),
  slug: z.string().trim().optional(),
  industry: z.enum(INDUSTRIES).default("salon"),
  timezone: z.string().trim().default("America/Los_Angeles"),
  starterServices: z.boolean().default(true),
});

/** Checks a time zone name Intl understands. */
export function validTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Finds a free slug based on the name ("barclays-salon", then "barclays-salon-2"). */
export async function freeSlug(base: string) {
  const root = slugSchema.safeParse(base).success ? base : slugify(base) || "business";
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    if (!slugSchema.safeParse(candidate).success) continue;
    const [hit] = await db().select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, candidate)).limit(1);
    if (!hit) return candidate;
  }
  throw new Error("Could not find a free link name. Pick one by hand.");
}

/**
 * Creates a business with sensible defaults for its industry: business hours
 * Tuesday to Saturday 9 to 6 (editable), and optionally the industry's starter menu.
 * Runs in one batch so a half-made business never exists.
 */
export async function createBusiness(raw: unknown) {
  const input = createBusinessInput.parse(raw);
  if (!validTimeZone(input.timezone)) throw new Error("That time zone is not recognized.");
  let slug: string;
  if (input.slug) {
    const parsed = slugSchema.safeParse(input.slug);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the link name");
    const [taken] = await db().select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, parsed.data)).limit(1);
    if (taken) throw new Error("That link name is taken.");
    slug = parsed.data;
  } else slug = await freeSlug(slugify(input.name));

  const wsId = uuidv7();
  const preset = INDUSTRY_PRESETS[input.industry as Industry];
  const hours = [2, 3, 4, 5, 6].map((weekday) => ({ workspaceId: wsId, weekday, startMin: 9 * 60, endMin: 18 * 60 }));

  const cats = new Map<string, string>();
  const serviceRows: (typeof services.$inferInsert)[] = [];
  if (input.starterServices) {
    preset.starterServices.forEach((s, i) => {
      if (!cats.has(s.category)) cats.set(s.category, uuidv7());
      serviceRows.push({
        workspaceId: wsId,
        categoryId: cats.get(s.category)!,
        name: s.name,
        activeBefore: s.activeBefore,
        processing: s.processing ?? 0,
        activeAfter: s.activeAfter ?? 0,
        bufferAfter: s.bufferAfter ?? 0,
        priceCents: s.priceCents,
        priceFrom: s.priceFrom ?? false,
        sortOrder: i,
      });
    });
  }

  const d = db();
  await batch([
    d.insert(workspaces).values({ id: wsId, name: input.name, slug, timezone: input.timezone, template: input.industry, settings: preset.settings ?? {} }),
    d.insert(businessHours).values(hours),
    ...(cats.size
      ? [d.insert(serviceCategories).values([...cats.entries()].map(([name, id], i) => ({ id, workspaceId: wsId, name, sortOrder: i })))]
      : []),
    ...(serviceRows.length ? [d.insert(services).values(serviceRows)] : []),
  ]);
  const [ws] = await d.select().from(workspaces).where(eq(workspaces.id, wsId));
  return ws;
}

/** Adds someone to a business (used when an invite is accepted). Safe to call twice. */
export async function addMember(workspaceId: string, userId: string, role: Role, title: string | null, opts: { bookable?: boolean } = {}) {
  const existing = await db().select({ id: memberships.id, deletedAt: memberships.deletedAt }).from(memberships).where(eq(memberships.workspaceId, workspaceId));
  const mine = await db()
    .select()
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
    .limit(1);
  if (mine[0]) {
    // Someone who left and was invited back comes back with the new role.
    await db().update(memberships).set({ deletedAt: null, role, title: title ?? mine[0].title }).where(eq(memberships.id, mine[0].id));
    return mine[0].id;
  }
  const [m] = await db()
    .insert(memberships)
    .values({ workspaceId, userId, role, title, color: memberColor(existing.length), sortOrder: existing.length, bookable: opts.bookable ?? true, bookableOnline: opts.bookable ?? true })
    .returning({ id: memberships.id });
  return m.id;
}

export interface Member {
  id: string;
  membershipId: string;
  name: string;
  email: string;
  role: Role;
  color: string;
  title: string | null;
  bookable: boolean;
  bookableOnline: boolean;
  bio: string | null;
  sortOrder: number;
}

/** Everyone on the team, in display order. `id` is the user id, `membershipId` the staff id. */
export async function loadMembers(workspaceId: string): Promise<Member[]> {
  return db()
    .select({
      id: user.id,
      membershipId: memberships.id,
      name: user.name,
      email: user.email,
      role: memberships.role,
      color: memberships.color,
      title: memberships.title,
      bookable: memberships.bookable,
      bookableOnline: memberships.bookableOnline,
      bio: memberships.bio,
      sortOrder: memberships.sortOrder,
    })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.workspaceId, workspaceId), isNull(memberships.deletedAt)))
    .orderBy(asc(memberships.sortOrder), asc(memberships.createdAt));
}

/** Pending invites for a business. */
export async function loadPendingInvites(workspaceId: string) {
  return db()
    .select({ id: invites.id, email: invites.email, role: invites.role, title: invites.title, expiresAt: invites.expiresAt })
    .from(invites)
    .where(and(eq(invites.workspaceId, workspaceId), isNull(invites.acceptedAt), isNull(invites.deletedAt)))
    .orderBy(asc(invites.createdAt));
}

/** Every business, for the platform admin page. */
export async function loadAllBusinesses() {
  return db().select().from(workspaces).where(isNull(workspaces.deletedAt)).orderBy(asc(workspaces.name));
}
