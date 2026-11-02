import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Exact-match public routes. Everything else needs a session cookie.
// (The cookie check is a fast first gate; every page and service also
// checks the real session on the server.)
const PUBLIC = new Set(["/", "/login", "/reset-password", "/privacy", "/terms", "/robots.txt", "/sitemap.xml"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.has(pathname) || pathname.startsWith("/api/auth/")) return NextResponse.next();
  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|og-image.png|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
