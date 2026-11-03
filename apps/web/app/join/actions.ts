"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { user } from "@evergreen/db";
import { auth, INVITE_HEADER } from "../../lib/auth";
import { db } from "../../lib/db";
import { ACTIVE_WORKSPACE_COOKIE, getSession } from "../../lib/services/ctx";
import { acceptInvite, findInvite } from "../../lib/services/team";

async function setActive(workspaceId: string) {
  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

const signupInput = z.object({
  token: z.string().min(10).max(100),
  name: z.string().trim().min(2, "Add your name").max(80),
  password: z.string().min(10, "Use at least 10 characters.").max(128),
});

/** New person: create their login from the invite, then join the business. */
export async function joinWithSignupAction(raw: unknown): Promise<{ ok: false; error: string } | void> {
  const parsed = signupInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { token, name, password } = parsed.data;
  const found = await findInvite(token);
  if (!found) return { ok: false, error: "This invite has expired or was already used. Ask for a new one." };
  const email = found.invite.email;
  const [existing] = await db().select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existing) return { ok: false, error: "You already have a login. Log in, then open this invite link again." };

  const h = new Headers(await headers());
  h.set(INVITE_HEADER, token);
  let userId: string;
  try {
    const res = await auth().api.signUpEmail({ body: { email, password, name }, headers: h });
    userId = res.user.id;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create your login." };
  }
  const joined = await acceptInvite(token, userId, email);
  await setActive(joined.workspaceId);
  redirect("/today");
}

/** Already signed in: join the business on the invite. */
export async function acceptSignedInAction(token: string): Promise<{ ok: false; error: string } | void> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/join?token=${token}`)}`);
  try {
    const joined = await acceptInvite(String(token), session.user.id, session.user.email);
    await setActive(joined.workspaceId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not accept the invite." };
  }
  redirect("/today");
}
