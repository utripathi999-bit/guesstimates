import { randomBytes } from 'crypto';

/**
 * Google sign-in, implemented as the plain authorization-code flow.
 *
 * Deliberately not Auth.js: the app already has a working session layer —
 * Redis-backed tokens behind an httpOnly cookie — and adding a framework would
 * mean either running two session systems side by side or migrating the one
 * that works. The code flow is about a hundred lines and plugs straight into
 * what is already here.
 *
 * The client secret is only ever read on the server, and the code-for-token
 * exchange is a direct server-to-server call to Google. Nothing secret is
 * exposed to the browser at any point in the flow.
 */

export const OAUTH_STATE_COOKIE = 'gd_oauth';
/** The round trip to Google and back; long enough to pick an account, short enough to be useless later. */
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export function isGoogleAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function callbackUrl(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

/** Opaque value tying the callback to the browser that started the flow — the CSRF defence. */
export function newState(): string {
  return randomBytes(24).toString('hex');
}

export function authorizeUrl(origin: string, state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID ?? '');
  url.searchParams.set('redirect_uri', callbackUrl(origin));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  // Always offer the chooser: people sharing a laptop, or signed into a
  // personal and a college account, otherwise get silently logged in as
  // whichever Google picked.
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export interface GoogleProfile {
  email: string;
  emailVerified: boolean;
  /** Their first name where Google gives one — the app asks for first names. */
  firstName: string;
}

/**
 * Exchanges the one-time code for the signed-in person's profile.
 *
 * Two network calls, both server-to-server over TLS: the code becomes an
 * access token, and the token is spent on the userinfo endpoint. Throws on
 * anything unexpected so the caller can fail the sign-in rather than carry on
 * with a half-known identity.
 */
export async function exchangeCodeForProfile(code: string, origin: string): Promise<GoogleProfile> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: callbackUrl(origin),
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    // Google's body can echo request parameters, so it is logged, never returned.
    throw new Error(`Google token exchange failed (${tokenRes.status}): ${(await tokenRes.text()).slice(0, 200)}`);
  }

  const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string };
  if (!accessToken) throw new Error('Google token exchange returned no access token');

  const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!infoRes.ok) throw new Error(`Google userinfo failed (${infoRes.status})`);

  const info = (await infoRes.json()) as {
    email?: string;
    email_verified?: boolean | string;
    given_name?: string;
    name?: string;
  };

  if (!info.email) throw new Error('Google profile had no email');

  return {
    email: info.email,
    // Google sends this as a boolean or the string "true" depending on the endpoint.
    emailVerified: info.email_verified === true || info.email_verified === 'true',
    firstName: pickFirstName(info.given_name, info.name, info.email),
  };
}

/** A sensible display name, since the leaderboard shows first names. */
function pickFirstName(givenName?: string, fullName?: string, email?: string): string {
  const candidate = givenName?.trim() || fullName?.trim().split(/\s+/)[0] || email?.split('@')[0] || '';
  const cleaned = candidate.replace(/[^\p{L}\p{N} .'-]/gu, '').trim();
  if (cleaned.length >= 2) return cleaned.slice(0, 40);
  return 'Student';
}
