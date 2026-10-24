import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeUrl,
  isGoogleAuthConfigured,
  newState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
} from '@/lib/googleAuth';

export const dynamic = 'force-dynamic';

/**
 * Starts Google sign-in.
 *
 * A GET that redirects, so it can be a plain link — no JavaScript, and nothing
 * for the browser to get wrong. The state is minted here and stashed in a
 * short-lived httpOnly cookie; the callback refuses anything that doesn't
 * match, which is what stops a sign-in being initiated from elsewhere.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;

  if (!isGoogleAuthConfigured()) {
    return NextResponse.redirect(new URL('/welcome?error=google_unavailable', origin));
  }

  const state = newState();
  // Only ever a path on this site, so the callback can't be used as an open redirect.
  const requested = searchParams.get('next') ?? '/';
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/';

  const response = NextResponse.redirect(authorizeUrl(origin, state));
  response.cookies.set(OAUTH_STATE_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Lax, not strict: the browser arrives back here from Google's domain, and
    // a strict cookie would not be sent on that navigation.
    sameSite: 'lax',
    path: '/',
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });
  return response;
}
