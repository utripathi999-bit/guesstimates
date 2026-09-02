import Link from 'next/link';
import { GuesstimateView } from '@/components/GuesstimateView';
import { Button } from '@/components/ui/Button';
import { getDailyPair, getQuestionById } from '@/lib/questionStore';

// Questions can be AI-generated and stored in Redis, so this resolves per-request.
export const dynamic = 'force-dynamic';

export default async function GuesstimatePage({ params }: PageProps<'/guesstimate/[id]'>) {
  const { id } = await params;
  const [guesstimate, daily] = await Promise.all([getQuestionById(id), getDailyPair()]);

  if (!guesstimate) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold text-foreground">Question not found</h1>
        <p className="text-text-muted">This guesstimate doesn&apos;t exist, or is no longer available.</p>
        <Link href="/">
          <Button variant="primary">Back to Today</Button>
        </Link>
      </main>
    );
  }

  return <GuesstimateView guesstimate={guesstimate} todaysIds={daily.questions.map((q) => q.id)} />;
}
