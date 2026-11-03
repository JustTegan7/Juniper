import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { and, eq, gt, isNull } from "drizzle-orm";
import { clients, invites, schema, workspaces } from "@evergreen/db";
import { db } from "./db";
import { sendEmail } from "./email";
import { isPlatformAdmin } from "./platform";
import { siteConfig } from "./site-config";
import { hashToken } from "./tokens";

export const INVITE_HEADER = "x-juniper-invite";

/** True when the request carries a live invite secret for this email. */
async function hasInvite(email: string, token: string | null | undefined) {
  if (!token) return false;
  const [row] = await db()
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.tokenHash, hashToken(token)), eq(invites.email, email), isNull(invites.acceptedAt), isNull(invites.deletedAt), gt(invites.expiresAt, new Date())))
    .limit(1);
  return Boolean(row);
}

/** The business a client magic link is for, read from its callback URL (/b/<slug>/...). */
function slugFromCallback(url: string): string | null {
  try {
    const cb = new URL(url).searchParams.get("callbackURL") ?? "";
    const m = /^\/b\/([a-z0-9-]+)\//.exec(cb);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

// Lazily built so `next build` works before env vars exist.
function createAuth() {
  const product = siteConfig.businessName;
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
    // When the Expo app is added: add the expo() plugin and the app's URL scheme here.
    trustedOrigins: [
      siteConfig.url,
      ...(process.env.EXTRA_TRUSTED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      ...[process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
        .filter(Boolean)
        .map((h) => `https://${h}`),
    ],
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      // Reset links last an hour and sign the person out everywhere once used.
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: `Reset your ${product} password`,
          text: `Hi ${user.name},\n\nUse this link to set a new ${product} password. It works for one hour.\n\n${url}\n\nIf you did not ask for this, you can ignore this email.\n\n${product}`,
        });
      },
    },
    rateLimit: { enabled: true, window: 60, max: 30 },
    databaseHooks: {
      user: {
        create: {
          before: async (u, ctx) => {
            const email = u.email.toLowerCase();
            // Evergreen staff who run the platform.
            if (isPlatformAdmin(email)) return { data: u };
            // Clients who booked online sign in with a magic link. Their account sees only their own appointments.
            if (ctx?.path?.startsWith("/magic-link")) return { data: u };
            // Team members need a live invite for this exact email.
            if (await hasInvite(email, ctx?.headers?.get(INVITE_HEADER))) return { data: u };
            throw new APIError("FORBIDDEN", { message: "You need an invite from your business to create a login." });
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: 60 * 15,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => {
          // Only send to people who are clients of the business the link is for, so this cannot be used to email strangers.
          const slug = slugFromCallback(url);
          if (!slug) return;
          const [hit] = await db()
            .select({ name: workspaces.name })
            .from(clients)
            .innerJoin(workspaces, eq(workspaces.id, clients.workspaceId))
            .where(and(eq(workspaces.slug, slug), eq(clients.email, email.toLowerCase()), isNull(clients.deletedAt), isNull(workspaces.deletedAt)))
            .limit(1);
          if (!hit) return;
          await sendEmail({
            to: email,
            subject: `Your ${hit.name} sign in link`,
            text: `Hi,\n\nUse this link to see and manage your appointments with ${hit.name}. It works for 15 minutes.\n\n${url}\n\nIf you did not ask for this, you can ignore this email.\n\n${hit.name}`,
          });
        },
      }),
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
let _auth: Auth | undefined;
export function auth(): Auth {
  if (!_auth) _auth = createAuth();
  return _auth;
}
