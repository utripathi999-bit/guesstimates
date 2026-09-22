'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Re-fetches the page when the question day has rolled over since it rendered.
 *
 * The server never serves stale questions — every request is uncached — but an
 * open tab never asks. Mobile browsers in particular restore a backgrounded tab
 * straight from memory, so a student who opened the app last night and unlocks
 * their phone in the morning sees yesterday's questions indefinitely, with
 * nothing to tell them the day has moved on. For a daily-habit app that is the
 * worst possible place to go quietly out of date.
 *
 * `renderedDate` is the UTC date the page was built for — the same basis the
 * server uses, so this rolls over at exactly 05:30 IST along with the questions.
 */
export function useRefreshOnNewDay(renderedDate: string): void {
  const router = useRouter();
  // One refresh per stale date. If the device clock is ahead of the server's,
  // the refreshed page can come back with the same date — without this guard
  // that would become a refresh every minute, forever.
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    function check() {
      const today = new Date().toISOString().slice(0, 10);
      if (today === renderedDate || refreshedFor.current === renderedDate) return;
      refreshedFor.current = renderedDate;
      router.refresh();
    }

    // Coming back to the tab is the moment that matters most.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    // A page restored from the back-forward cache fires this, not a load.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) check();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    // And a tab left in the foreground straight across 05:30.
    const timer = window.setInterval(check, 60_000);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      window.clearInterval(timer);
    };
  }, [renderedDate, router]);
}
