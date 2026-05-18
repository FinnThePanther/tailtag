import { supabase } from '../../../lib/supabase';
import { mapFursuitColors } from '../../suits';
import type { FursuitColorOption } from '../../colors';
import { FURSUIT_BUCKET } from '../../../constants/storage';
import { resolveStorageMediaUrl } from '../../../utils/supabase-image';

export type LeaderboardEntry = {
  profileId: string;
  username: string | null;
  catchCount: number;
  isRedacted: boolean;
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
  isRedacted: boolean;
};

export const CONVENTION_LEADERBOARD_QUERY_KEY = 'convention-leaderboard';

export const conventionLeaderboardQueryKey = (userId: string, conventionId: string) =>
  [CONVENTION_LEADERBOARD_QUERY_KEY, userId, conventionId] as const;

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
    .map((row) => ({
      profileId: row.catcher_id!,
      username: row.username,
      catchCount: row.catch_count!,
      isRedacted: row.profile_redacted === true,
    }));
}

export const createConventionLeaderboardQueryOptions = (userId: string, conventionId: string) => ({
  queryKey: conventionLeaderboardQueryKey(userId, conventionId),
  queryFn: () => fetchConventionLeaderboard(conventionId),
  staleTime: 30_000, // Reduced from 60s to 30s for fresher data
  refetchOnWindowFocus: true, // Refetch when user returns to app
  refetchOnReconnect: false,
});

export const CONVENTION_SUIT_LEADERBOARD_QUERY_KEY = 'convention-suit-leaderboard';

export const conventionSuitLeaderboardQueryKey = (userId: string, conventionId: string) =>
  [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, userId, conventionId] as const;

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
    .map((row) => {
      const isRedacted = row.fursuit_redacted === true;
      return {
        fursuitId: row.fursuit_id!,
        name: isRedacted ? 'Age-restricted fursuit' : (row.fursuit_name ?? 'Unknown suit'),
        species: row.species_name,
        speciesId: row.species_id,
        colors: mapFursuitColors(row.color_assignments),
        avatarUrl: isRedacted
          ? null
          : resolveStorageMediaUrl({
              bucket: FURSUIT_BUCKET,
              path: null,
              legacyUrl: row.fursuit_avatar_url,
            }),
        ownerProfileId: row.owner_id,
        ownerUsername: null, // Not in materialized view, but not displayed in UI
        catchCount: row.catch_count!,
        isRedacted,
      } satisfies SuitLeaderboardEntry;
    });
}

export const createConventionSuitLeaderboardQueryOptions = (
  userId: string,
  conventionId: string,
) => ({
  queryKey: conventionSuitLeaderboardQueryKey(userId, conventionId),
  queryFn: () => fetchConventionSuitLeaderboard(conventionId),
  staleTime: 30_000, // Reduced from 60s to 30s for fresher data
  refetchOnWindowFocus: true, // Refetch when user returns to app
  refetchOnReconnect: false,
});
