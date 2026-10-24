import { NextRequest, NextResponse } from 'next/server';
import {
  createAccount,
  createSession,
  getAccountByEmail,
  normalizeEmail,
  releaseAccountSlot,
  reserveAccountSlot,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth';
import { exchangeCodeForProfile, isGoogleAuthConfigured, OAUTH_STATE_COOKIE } from '@/lib/googleAuth';

export const dynamic = 'force-dynamic';

/** Sends them back to the sign-in screen with something it can explain. */
function fail(origin: string, reason: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/welcome?error=${reason}`, origin));
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;

  if (!isGoogleAuthConfigured()) return fail(origin, 'google_unavailable');

  // They pressed Cancel on Google's screen — not an error worth a message.
  if (searchParams.get('error')) return fail(origin, 'google_cancelled');

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  if (!code || !state) return fail(origin, 'google_failed');

  // The state must match the one minted when this flow started, in this browser.
  let stored: { state?: string; next?: string } = {};
  try {
    stored = JSON.parse(request.cookies.get(OAUTH_STATE_COOKIE)?.value ?? '{}');
  } catch {
    return fail(origin, 'google_failed');
  }
  if (!stored.state || stored.state !== state) return fail(origin, 'google_failed');

  let profile;
  try {
    profile = await exchangeCodeForProfile(code, origin);
  } catch (error) {
    console.error('google callback: exchange failed', error);
    return fail(origin, 'google_failed');
  }

  // An unverified Google address proves nothing about who is signing in, and
  // email is the identity this whole app is keyed on.
  if (!profile.emailVerified) return fail(origin, 'google_unverified');

  const normalizedEmail = normalizeEmail(profile.email);

  try {
    const existing = await getAccountByEmail(normalizedEmail);

    // Same email, same person: someone who signed up with a password and later
    // uses Google lands on their own progress rather than a second account.
    if (!existing) {
      if (!(await reserveAccountSlot())) return fail(origin, 'full');
      try {
        await createAccount(normalizedEmail, null, profile.firstName, 'google');
      } catch (error) {
        await releaseAccountSlot();
        throw error;
      }
    }

    const token = await createSession(normalizedEmail);
    const destination = stored.next && stored.next.startsWith('/') ? stored.next : '/';

    const response = NextResponse.redirect(new URL(destination, origin));
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  } catch (error) {
    console.error('google callback: sign-in failed', error);
    return fail(origin, 'google_failed');
  }
}
