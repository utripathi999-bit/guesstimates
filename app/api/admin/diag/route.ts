import { NextRequest, NextResponse } from 'next/server';
import { listAllAccounts } from '@/lib/auth';
import { getFullLeaderboard } from '@/lib/leaderboard';
import { getRedis, KEYS } from '@/lib/redis';

export const dynamic = 'force-dynamic';

/** TEMPORARY diagnostic, admin-token gated. Remove once the leaderboard fault is fixed. */
export async function GET(request: NextRequest) {
  const header = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || header !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const results: Record<string, unknown> = {};
  const capture = async (label: string, fn: () => Promise<unknown>) => {
    try {
      results[label] = { ok: true, value: await fn() };
    } catch (error) {
      results[label] = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : undefined,
      };
    }
  };

  await capture('rawScan', async () => {
    const res = await getRedis().scan('0', { match: KEYS.account('*'), count: 200 });
    return { shape: Array.isArray(res) ? 'array' : typeof res, res };
  });
  await capture('listAllAccounts', () => listAllAccounts());
  await capture('getFullLeaderboard', () => getFullLeaderboard());

  return NextResponse.json(results);
}
