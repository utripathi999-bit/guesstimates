import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/**
 * True only after hydration. Used instead of a useState+useEffect "mounted"
 * flag: useSyncExternalStore's dual server/client snapshot is the React-
 * sanctioned mechanism for exactly this SSR/CSR-divergent value, and it
 * doesn't trigger the "setState in effect" lint heuristic the useState
 * version does.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}
