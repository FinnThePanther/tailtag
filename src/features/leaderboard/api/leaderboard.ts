import { supabase } from '../../../lib/supabase';

export type LeaderboardEntry = {
  profileId: string;
  username: string | null;
  avatarUrl: string | null;
  catchCount: number;
};

export const CONVENTION_LEADERBOARD_QUERY_KEY = 'convention-leaderboard';

export const conventionLeaderboardQueryKey = (conventionId: string) =>
  [CONVENTION_LEADERBOARD_QUERY_KEY, conventionId] as const;

export async function fetchConventionLeaderboard(conventionId: string): Promise<LeaderboardEntry[]> {
  const client = supabase as any;

  const { data: membershipRows, error: membershipError } = await client
    .from('profile_conventions')
    .select('profile_id')
    .eq('convention_id', conventionId);

  if (membershipError) {
    throw new Error(`We couldn't load convention participants: ${membershipError.message}`);
  }

  const membershipEntries = (membershipRows ?? []) as { profile_id: string | null }[];
  const participantIds = Array.from(
    new Set(
      membershipEntries
        .map((row) => row.profile_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  if (participantIds.length === 0) {
    return [];
  }

  const { data: profileRows, error: profileError } = await client
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', participantIds);

  if (profileError) {
    throw new Error(`We couldn't load player profiles: ${profileError.message}`);
  }

  const profileEntries = (profileRows ?? []) as {
    id: string;
    username: string | null;
    avatar_url: string | null;
  }[];

  const profileMap = new Map<string, { username: string | null; avatarUrl: string | null }>();

  for (const row of profileEntries) {
    profileMap.set(row.id, {
      username: row.username ?? null,
      avatarUrl: row.avatar_url ?? null,
    });
  }

  const { data: fursuitRows, error: fursuitError } = await client
    .from('fursuit_conventions')
    .select('fursuit_id')
    .eq('convention_id', conventionId);

  if (fursuitError) {
    throw new Error(`We couldn't load convention fursuits: ${fursuitError.message}`);
  }

  const fursuitEntries = (fursuitRows ?? []) as { fursuit_id: string | null }[];

  const conventionFursuitIds = Array.from(
    new Set(
      fursuitEntries
        .map((row) => row.fursuit_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  const catchCounts = new Map<string, number>();

  if (conventionFursuitIds.length > 0) {
    const { data: catchRows, error: catchesError } = await client
      .from('catches')
      .select('id, catcher_id, fursuit_id')
      .in('catcher_id', participantIds)
      .in('fursuit_id', conventionFursuitIds);

    if (catchesError) {
      throw new Error(`We couldn't load convention catches: ${catchesError.message}`);
    }

    const catchEntries = (catchRows ?? []) as { catcher_id: string | null }[];

    for (const row of catchEntries) {
      const catcherId = row.catcher_id;
      if (!catcherId) {
        continue;
      }
      catchCounts.set(catcherId, (catchCounts.get(catcherId) ?? 0) + 1);
    }
  }

  const entries: LeaderboardEntry[] = participantIds.map((profileId) => {
    const profile = profileMap.get(profileId) ?? { username: null, avatarUrl: null };
    return {
      profileId,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      catchCount: catchCounts.get(profileId) ?? 0,
    };
  });

  return entries.sort((a, b) => {
    if (b.catchCount !== a.catchCount) {
      return b.catchCount - a.catchCount;
    }

    const nameA = (a.username ?? '').toLowerCase();
    const nameB = (b.username ?? '').toLowerCase();

    if (nameA && nameB && nameA !== nameB) {
      return nameA < nameB ? -1 : 1;
    }

    if (!nameA && nameB) {
      return 1;
    }

    if (nameA && !nameB) {
      return -1;
    }

    return a.profileId < b.profileId ? -1 : 1;
  });
}

export const createConventionLeaderboardQueryOptions = (conventionId: string) => ({
  queryKey: conventionLeaderboardQueryKey(conventionId),
  queryFn: () => fetchConventionLeaderboard(conventionId),
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
