import "server-only";

/**
 * Evergreen Digital staff who run Juniper itself (PLATFORM_ADMINS env var,
 * comma separated emails). They can create businesses at /admin and invite each
 * business's first owner. They do not see a business's data unless they are a member.
 */
export function platformAdmins(): Set<string> {
  return new Set(
    (process.env.PLATFORM_ADMINS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdmin(email: string | null | undefined): boolean {
  return Boolean(email && platformAdmins().has(email.toLowerCase()));
}

/** Absolute base URL for links in emails. */
export function appUrl(): string {
  const u =
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined) ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return u.replace(/\/$/, "");
}
