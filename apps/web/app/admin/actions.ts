"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { memberships } from "@evergreen/db";
import { db } from "../../lib/db";
import { toResult } from "../../lib/action-result";
import { isPlatformAdmin } from "../../lib/platform";
import { ACTIVE_WORKSPACE_COOKIE, getSession } from "../../lib/services/ctx";
import { deleteBusiness } from "../../lib/services/admin";
import { issueInvite } from "../../lib/services/team";
import { addMember, createBusiness } from "../../lib/services/workspace";

async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (!isPlatformAdmin(session.user.email)) throw new Error("Only Juniper admins can do that.");
  return session;
}

const createInput = z.object({
  name: z.string(),
  slug: z.string().optional(),
  industry: z.string(),
  timezone: z.string(),
  starterServices: z.coerce.boolean().default(false),
  ownerEmail: z.string().trim().optional(),
  ownerTitle: z.string().trim().optional(),
  addMe: z.coerce.boolean().default(false),
});

/** Creates a business, optionally invites its owner and adds the admin as an owner for setup. */
export async function createBusinessAction(raw: unknown) {
  return toResult(async () => {
    const session = await requireAdmin();
    const v = createInput.parse(raw);
    const ws = await createBusiness({ name: v.name, slug: v.slug || undefined, industry: v.industry, timezone: v.timezone, starterServices: v.starterServices });
    let note = "";
    if (v.addMe) await addMember(ws.id, session.user.id, "owner", "Evergreen support", { bookable: false });
    if (v.ownerEmail) {
      const { link, sent } = await issueInvite(ws.id, { email: v.ownerEmail, role: "owner", title: v.ownerTitle || "Owner" }, session.user.id);
      note = sent ? ` Invite emailed to ${v.ownerEmail}.` : "";
      if (!sent) return { message: `${ws.name} created. Email is not set up, so send the owner this link.`, data: link };
    }
    return { message: `${ws.name} created at /b/${ws.slug}.${note}` };
  });
}

export async function inviteOwnerAction(raw: unknown) {
  return toResult(async () => {
    const session = await requireAdmin();
    const v = z.object({ workspaceId: z.uuid(), email: z.string(), role: z.enum(["owner", "manager"]).default("owner") }).parse(raw);
    const { link, sent } = await issueInvite(v.workspaceId, { email: v.email, role: v.role }, session.user.id);
    return sent ? { message: `Invite emailed to ${v.email}.` } : { message: "Invite created. Send this link.", data: link };
  });
}

/** Adds the admin to a business for support, then opens it. Recorded in that business's audit log. */
export async function joinForSupportAction(workspaceId: string) {
  const session = await requireAdmin();
  const id = z.uuid().parse(workspaceId);
  const [already] = await db()
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, id), eq(memberships.userId, session.user.id), isNull(memberships.deletedAt)))
    .limit(1);
  // Keep any role they already have there.
  if (!already) await addMember(id, session.user.id, "manager", "Evergreen support", { bookable: false });
  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/today");
}

/** Permanently deletes a business. The service re-checks the platform admin and the typed link name. */
export async function deleteBusinessAction(raw: unknown) {
  return toResult(async () => {
    const session = await requireAdmin();
    const r = await deleteBusiness({ userId: session.user.id, email: session.user.email }, raw);
    return { message: `${r.name} (/b/${r.slug}) was deleted.` };
  });
}
