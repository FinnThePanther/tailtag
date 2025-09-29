import { supabase } from '../../../lib/supabase';
import type { FursuitSummary } from '../types';
import { mapLatestFursuitBio } from './utils';

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
      fursuit:fursuits (
        id,
        name,
        species,
        avatar_url,
        unique_code,
        created_at,
        fursuit_bios (
          version,
          fursuit_name,
          fursuit_species,
          owner_name,
          pronouns,
          tagline,
          fun_fact,
          likes_and_interests,
          ask_me_about,
          social_links,
          created_at,
          updated_at
        )
      )
    `
    )
    .eq('catcher_id', userId)
    .order('caught_at', { ascending: false });

  if (error) {
    throw new Error(`We couldn't load your catches: ${error.message}`);
  }

  return (data ?? []).map((record: any) => {
    const fursuit = record.fursuit
      ? ({
          id: record.fursuit.id,
          name: record.fursuit.name,
          species: record.fursuit.species ?? null,
          avatar_url: record.fursuit.avatar_url ?? null,
          unique_code: record.fursuit.unique_code ?? null,
          created_at: record.fursuit.created_at ?? null,
          conventions: [],
          bio: mapLatestFursuitBio(record.fursuit.fursuit_bios ?? null),
        } satisfies FursuitSummary)
      : null;

    return {
      id: record.id,
      caught_at: record.caught_at ?? null,
      fursuit,
    } satisfies CaughtRecord;
  });
}

export const createCaughtSuitsQueryOptions = (userId: string) => ({
  queryKey: caughtSuitsQueryKey(userId),
  queryFn: () => fetchCaughtSuits(userId),
  staleTime: CAUGHT_SUITS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
