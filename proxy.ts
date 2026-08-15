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

const AUTH_ROUTES = ["/login", "/signup", "/request-access"];

/** Exact-match public paths. */
const PUBLIC_ROUTES = ["/"];

/**
 * Prefixes readable without a session.
 *
 * `/share/*` is a shared notebook opened through a capability token, and
 * `/invite/*` is how an approved person creates their account. Both must stay
 * reachable while signed out — bouncing them to the login page would defeat
 * the feature. In each case the token itself is the authorization and is
 * re-checked against the database on every request; this list only decides
 * who gets to reach the handler.
 */
const PUBLIC_PREFIXES = ["/share/", "/invite/"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = Boolean(getSessionCookie(request));

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
  const isPublicRoute =
    PUBLIC_ROUTES.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

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
   * internals, static files, and **all of `/api`**.
   *
   * The API exclusion matters: redirecting an unauthenticated `fetch` to an
   * HTML login page would surface to the client as a 200 full of markup.
   * Route handlers do their own auth check and answer with a real 401.
   *
   * Media extensions are listed for the same reason images are: the landing
   * page demo is served to signed-out visitors, and without `mp4` here the
   * proxy answered the video request with a redirect to /login.
   */
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|mp4|webm|mov)$).*)",
  ],
};
