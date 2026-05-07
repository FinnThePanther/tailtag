import { supabase } from '../../../lib/supabase';
import { mapFursuitColors } from '../../suits';
import type { FursuitColorOption } from '../../colors';
import { FURSUIT_BUCKET } from '../../../constants/storage';
import { resolveStorageMediaUrl } from '../../../utils/supabase-image';

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

export async function fetchConventionLeaderboard(
  conventionId: string,
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc('get_convention_leaderboard', {
    p_convention_id: conventionId,
  });

  if (error) {
    throw new Error(`We couldn't load the leaderboard: ${error.message}`);
  }

  return (data ?? [])
    .filter((row) => row.catcher_id != null && row.catch_count != null)
    .sort((a, b) => {
      const countDiff = Number(b.catch_count ?? 0) - Number(a.catch_count ?? 0);
      if (countDiff !== 0) return countDiff;

      const usernameA = a.username ?? '\uffff';
      const usernameB = b.username ?? '\uffff';
      const usernameDiff = usernameA.localeCompare(usernameB);
      if (usernameDiff !== 0) return usernameDiff;

      return (a.catcher_id ?? '').localeCompare(b.catcher_id ?? '');
    })
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

export async function fetchConventionSuitLeaderboard(
  conventionId: string,
): Promise<SuitLeaderboardEntry[]> {
  const { data, error } = await supabase.rpc('get_convention_suit_leaderboard', {
    p_convention_id: conventionId,
  });

  if (error) {
    throw new Error(`We couldn't load the suit leaderboard: ${error.message}`);
  }

  return (data ?? [])
    .filter((row) => row.fursuit_id != null && row.catch_count != null)
    .sort((a, b) => {
      const countDiff = Number(b.catch_count ?? 0) - Number(a.catch_count ?? 0);
      if (countDiff !== 0) return countDiff;

      const nameDiff = (a.fursuit_name ?? '').localeCompare(b.fursuit_name ?? '');
      if (nameDiff !== 0) return nameDiff;

      return (a.fursuit_id ?? '').localeCompare(b.fursuit_id ?? '');
    })
    .map((row) => {
      return {
        fursuitId: row.fursuit_id!,
        name: row.fursuit_name ?? 'Unknown suit',
        species: row.species_name,
        speciesId: row.species_id,
        colors: mapFursuitColors(row.color_assignments),
        avatarUrl: resolveStorageMediaUrl({
          bucket: FURSUIT_BUCKET,
          path: null,
          legacyUrl: row.fursuit_avatar_url,
        }),
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
