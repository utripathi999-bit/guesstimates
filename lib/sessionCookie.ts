/**
 * Session cookie constants, deliberately isolated from lib/auth.ts.
 *
 * The proxy (formerly middleware) runs on the Edge Runtime and only needs the
 * cookie's name. Importing it from lib/auth.ts would pull bcryptjs and Node's
 * `crypto` into the Edge bundle — unsupported there, and dead weight on every
 * single request.
 */

export const SESSION_COOKIE_NAME = 'gd_session';

/** Browsers cap cookie lifetime at ~400 days regardless of what's requested — there's no true "forever" cookie. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;
