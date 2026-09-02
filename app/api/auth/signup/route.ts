import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAccount, createSession, getAccountByEmail, normalizeEmail, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const SignupZ = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(2).max(40),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = SignupZ.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid request', issues: validation.error.issues }, { status: 400 });
  }

  const { email, password, displayName } = validation.data;
  const normalizedEmail = normalizeEmail(email);

  try {
    const existing = await getAccountByEmail(normalizedEmail);
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    const account = await createAccount(normalizedEmail, password, displayName);
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
    console.error('signup failed:', error);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
