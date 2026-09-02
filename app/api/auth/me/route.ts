import { NextRequest, NextResponse } from 'next/server';
import { getSessionAccount } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const account = await getSessionAccount(request);
    if (!account) return NextResponse.json({ account: null });
    return NextResponse.json({ account: { email: account.email, displayName: account.displayName } });
  } catch (error) {
    console.error('session check failed:', error);
    return NextResponse.json({ account: null });
  }
}
