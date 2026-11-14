import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Public routes. Everything else needs a session cookie.
// (The cookie check is a fast first gate; every page and service also
// checks the real session on the server.)
const PUBLIC = new Set(["/", "/login", "/reset-password", "/privacy", "/terms", "/robots.txt", "/sitemap.xml", "/join", "/embed.js"]);
// Client booking pages, the embed, auth endpoints, the cron (which checks its own secret) and the
// phone API (which sends a bearer token, not a cookie, and checks the session in every handler).
const PUBLIC_PREFIXES = ["/b/", "/shop/", "/embed/", "/api/auth/", "/api/cron/", "/api/v1/", "/api/webhooks/helcim/"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|og-image.png|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
