import { Suspense } from 'react';
import { WelcomeGate } from '@/components/WelcomeGate';

export const dynamic = 'force-dynamic';

export default function WelcomePage() {
  // useSearchParams (for the post-sign-in redirect target) requires a Suspense boundary.
  return (
    <Suspense>
      <WelcomeGate />
    </Suspense>
  );
}
