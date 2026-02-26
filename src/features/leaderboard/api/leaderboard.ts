import { supabase } from '../../../lib/supabase';
import { mapFursuitColors } from '../../suits';
import type { FursuitColorOption } from '../../colors';

export type LeaderboardEntry = {
  profileId: string;
  username: string | null;
  catchCount: number;
};

export type SuitLeaderboardEntry = {
  fursuitId: string;
  name: string;
  species: string | null;
  speciesId: string | null;
  colors: FursuitColorOption[];
  avatarUrl: string | null;
  ownerProfileId: string | null;
  ownerUsername: string | null;
  catchCount: number;
};

export const CONVENTION_LEADERBOARD_QUERY_KEY = 'convention-leaderboard';

export const conventionLeaderboardQueryKey = (conventionId: string) =>
  [CONVENTION_LEADERBOARD_QUERY_KEY, conventionId] as const;

export async function fetchConventionLeaderboard(conventionId: string): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('mv_convention_leaderboard')
    .select('*')
    .eq('convention_id', conventionId)
    .order('catch_count', { ascending: false })
    .order('username', { ascending: true, nullsFirst: false })
    .order('catcher_id', { ascending: true });

  if (error) {
    throw new Error(`We couldn't load the leaderboard: ${error.message}`);
  }

  return (data ?? [])
    .filter((row) => row.catcher_id != null && row.catch_count != null)
    .map((row) => ({
      profileId: row.catcher_id!,
      username: row.username,
      catchCount: row.catch_count!,
    }));
}

export const createConventionLeaderboardQueryOptions = (conventionId: string) => ({
  queryKey: conventionLeaderboardQueryKey(conventionId),
  queryFn: () => fetchConventionLeaderboard(conventionId),
  staleTime: 30_000, // Reduced from 60s to 30s for fresher data
  refetchOnWindowFocus: true, // Refetch when user returns to app
  refetchOnReconnect: false,
});

export const CONVENTION_SUIT_LEADERBOARD_QUERY_KEY = 'convention-suit-leaderboard';

export const conventionSuitLeaderboardQueryKey = (conventionId: string) =>
  [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, conventionId] as const;

export async function fetchConventionSuitLeaderboard(conventionId: string): Promise<SuitLeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('mv_fursuit_popularity')
    .select(
      `
      *,
      fursuit:fursuits (
        species_entry:fursuit_species (
          id,
          name
        ),
        color_assignments:fursuit_color_assignments (
          position,
          color:fursuit_colors (
            id,
            name,
            normalized_name
          )
        )
      )
    `
    )
    .eq('convention_id', conventionId)
    .order('catch_count', { ascending: false })
    .order('fursuit_name', { ascending: true })
    .order('fursuit_id', { ascending: true });

  if (error) {
    throw new Error(`We couldn't load the suit leaderboard: ${error.message}`);
  }

  return (data ?? [])
    .filter((row) => row.fursuit_id != null && row.catch_count != null)
    .map((row) => {
      const fursuit = row.fursuit as any;
      return {
        fursuitId: row.fursuit_id!,
        name: row.fursuit_name ?? 'Unknown suit',
        species: fursuit?.species_entry?.name ?? null,
        speciesId: fursuit?.species_entry?.id ?? null,
        colors: mapFursuitColors(fursuit?.color_assignments ?? null),
        avatarUrl: row.fursuit_avatar_url,
        ownerProfileId: row.owner_id,
        ownerUsername: null, // Not in materialized view, but not displayed in UI
        catchCount: row.catch_count!,
      } satisfies SuitLeaderboardEntry;
    });
}

export const createConventionSuitLeaderboardQueryOptions = (conventionId: string) => ({
  queryKey: conventionSuitLeaderboardQueryKey(conventionId),
  queryFn: () => fetchConventionSuitLeaderboard(conventionId),
  staleTime: 30_000, // Reduced from 60s to 30s for fresher data
  refetchOnWindowFocus: true, // Refetch when user returns to app
  refetchOnReconnect: false,
});
