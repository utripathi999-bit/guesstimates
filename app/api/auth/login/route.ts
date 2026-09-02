import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession, getAccountByEmail, normalizeEmail, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, verifyPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const LoginZ = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = LoginZ.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid request', issues: validation.error.issues }, { status: 400 });
  }

  const normalizedEmail = normalizeEmail(validation.data.email);

  try {
    const account = await getAccountByEmail(normalizedEmail);
    const passwordOk = account ? await verifyPassword(validation.data.password, account.passwordHash) : false;

    if (!account || !passwordOk) {
      // Deliberately generic — never reveal whether the email or the password was the wrong part.
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const token = await createSession(normalizedEmail);
    const response = NextResponse.json({ account: { email: account.email, displayName: account.displayName } });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    console.error('login failed:', error);
    return NextResponse.json({ error: 'Failed to log in' }, { status: 500 });
  }
}
