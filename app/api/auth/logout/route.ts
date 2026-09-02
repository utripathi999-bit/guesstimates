import { NextRequest, NextResponse } from 'next/server';
import { destroySession, SESSION_COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    try {
      await destroySession(token);
    } catch (error) {
      console.error('logout failed:', error);
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
