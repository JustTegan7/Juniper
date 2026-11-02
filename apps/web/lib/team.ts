import "server-only";
import type { Role } from "@evergreen/core";

/**
 * Who may create a login, from the APP_TEAM env var on Vercel
 * (email:role pairs, comma separated, roles: owner, manager, member).
 * Anyone not on the list is refused at sign-up, on the server.
 * Multi-business sign-up replaces this when the first app needs it.
 */
export function teamAllowlist(): Map<string, Role> {
  const out = new Map<string, Role>();
  for (const entry of (process.env.APP_TEAM ?? "").split(",")) {
    const [email, role] = entry.trim().split(":").map((s) => s?.trim());
    if (!email) continue;
    const r: Role = role === "owner" || role === "manager" ? role : "member";
    if (!out.has(email.toLowerCase())) out.set(email.toLowerCase(), r);
  }
  return out;
}
