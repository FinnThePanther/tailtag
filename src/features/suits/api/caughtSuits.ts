import { supabase } from '../../../lib/supabase';
import type { FursuitSummary } from './mySuits';

export type CaughtRecord = {
  id: string;
  caught_at: string | null;
  fursuit: FursuitSummary | null;
};

export const CAUGHT_SUITS_QUERY_KEY = 'caught-suits';
export const CAUGHT_SUITS_STALE_TIME = 2 * 60_000;

export const caughtSuitsQueryKey = (userId: string) => [CAUGHT_SUITS_QUERY_KEY, userId] as const;

export async function fetchCaughtSuits(userId: string): Promise<CaughtRecord[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('catches')
    .select(
      `
      id,
      caught_at,
      fursuit:fursuits (id, name, species, avatar_url, unique_code)
    `
    )
    .eq('catcher_id', userId)
    .order('caught_at', { ascending: false });

  if (error) {
    throw new Error(`We couldn't load your catches: ${error.message}`);
  }

  return data ?? [];
}

export const createCaughtSuitsQueryOptions = (userId: string) => ({
  queryKey: caughtSuitsQueryKey(userId),
  queryFn: () => fetchCaughtSuits(userId),
  staleTime: CAUGHT_SUITS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
