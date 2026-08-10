import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Next.js 16 renamed `middleware` to `proxy` (root-level file, `nodejs`
 * runtime only — the edge runtime is unsupported here).
 *
 * This is an *optimistic* check by design: it only looks for the presence of a
 * session cookie so that signed-out visitors bounce instantly instead of
 * paying for a render. It is not authorization. Every protected route and
 * server action independently calls `requireUser()`, which validates the
 * session against the database.
 */

const AUTH_ROUTES = ["/login", "/signup"];
const PUBLIC_ROUTES = ["/"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = Boolean(getSessionCookie(request));

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  // Signed in but sitting on login/signup — send them to their shelf.
  if (hasSessionCookie && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Signed out and asking for something private — bounce, remembering where
  // they were headed so login can return them there.
  if (!hasSessionCookie && !isAuthRoute && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    const target = `${pathname}${search}`;
    if (target !== "/dashboard") {
      loginUrl.searchParams.set("next", target);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Without a matcher this runs on every asset request. Excluded: Next's
   * internals, the auth endpoints themselves (they must stay reachable while
   * signed out), and anything that looks like a static file.
   */
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
