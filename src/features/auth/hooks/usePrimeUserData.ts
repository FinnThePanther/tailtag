import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { createProfileQueryOptions, PROFILE_QUERY_KEY } from '../../profile';
import {
  createMySuitsQueryOptions,
  MY_SUITS_QUERY_KEY,
  createCaughtSuitsQueryOptions,
  CAUGHT_SUITS_QUERY_KEY,
} from '../../suits';

const QUERY_PREFIXES_TO_CLEAR = [
  [PROFILE_QUERY_KEY] as const,
  [MY_SUITS_QUERY_KEY] as const,
  [CAUGHT_SUITS_QUERY_KEY] as const,
];

/**
 * Prefetch the core user data set right after authentication so downstream screens stay snappy.
 */
export function usePrimeUserData(userId: string | null) {
  const queryClient = useQueryClient();
  const primedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      primedUserIdRef.current = null;
      QUERY_PREFIXES_TO_CLEAR.forEach((queryKey) => {
        queryClient.removeQueries({ queryKey });
      });
      return;
    }

    if (primedUserIdRef.current === userId) {
      return;
    }

    let cancelled = false;

    const prime = async () => {
      try {
        await Promise.all([
          queryClient.prefetchQuery(createProfileQueryOptions(userId)),
          queryClient.prefetchQuery(createMySuitsQueryOptions(userId)),
          queryClient.prefetchQuery(createCaughtSuitsQueryOptions(userId)),
        ]);

        if (!cancelled) {
          primedUserIdRef.current = userId;
        }
      } catch (caught) {
        console.warn('Failed to preload user data', caught);
      }
    };

    void prime();

    return () => {
      cancelled = true;
    };
  }, [queryClient, userId]);
}
