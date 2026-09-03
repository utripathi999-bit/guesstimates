import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/sessionCookie';

/** Pages reachable without an account. Everything else requires sign-in. */
const PUBLIC_PATHS = ['/welcome'];

/**
 * Hard gate: no account, no app. Redirects signed-out visitors to /welcome so
 * every user of the app is an identified person.
 *
 * This checks only that a session cookie is *present* — it deliberately does
 * not validate it against Redis, because this runs on every request and a
 * lookup per request is real latency for what is a UX redirect. Actual
 * enforcement still happens where it matters: every API route that acts on a
 * user's behalf resolves and validates the session properly, so a forged
 * cookie gets you the shell of the UI and nothing functional.
 *
 * Imports only from lib/sessionCookie — pulling in lib/auth here would drag
 * bcryptjs and Node's crypto into the Edge bundle.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  if (request.cookies.get(SESSION_COOKIE_NAME)?.value) {
    return NextResponse.next();
  }

  const welcomeUrl = new URL('/welcome', request.url);
  // Remember where they were headed so sign-in can return them there.
  if (pathname !== '/') welcomeUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(welcomeUrl);
}

export const config = {
  /**
   * Skip API routes (they authenticate themselves and must stay callable for
   * sign-in/sign-up), Next internals, and static files.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
