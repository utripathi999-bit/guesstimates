import { TodayView } from '@/components/TodayView';
import { getDailyPair } from '@/lib/questionStore';

// Resolved per-request: today's pair may be AI-generated and living in Redis,
// so it can't be baked in at build time.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { questions, source } = await getDailyPair();
  return <TodayView dailyPair={questions} source={source} />;
}
