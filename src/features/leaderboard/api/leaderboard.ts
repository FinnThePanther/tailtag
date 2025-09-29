import { supabase } from '../../../lib/supabase';

export type LeaderboardEntry = {
  profileId: string;
  username: string | null;
  avatarUrl: string | null;
  catchCount: number;
};

export type SuitLeaderboardEntry = {
  fursuitId: string;
  name: string;
  species: string | null;
  speciesId: string | null;
  avatarUrl: string | null;
  ownerProfileId: string | null;
  ownerUsername: string | null;
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

export const CONVENTION_SUIT_LEADERBOARD_QUERY_KEY = 'convention-suit-leaderboard';

export const conventionSuitLeaderboardQueryKey = (conventionId: string) =>
  [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, conventionId] as const;

export async function fetchConventionSuitLeaderboard(conventionId: string): Promise<SuitLeaderboardEntry[]> {
  const client = supabase as any;

  const { data: suitRows, error: suitError } = await client
    .from('fursuit_conventions')
    .select(
      `
      fursuit:fursuits (
        id,
        name,
        species,
        species_id,
        avatar_url,
        owner_id,
        species_entry:fursuit_species (
          id,
          name,
          normalized_name
        ),
        owner:profiles (id, username)
      )
    `
    )
    .eq('convention_id', conventionId);

  if (suitError) {
    throw new Error(`We couldn't load convention fursuits: ${suitError.message}`);
  }

  const suitEntries = (suitRows ?? []) as {
    fursuit: {
      id: string | null;
      name: string | null;
      species: string | null;
      species_id: string | null;
      avatar_url: string | null;
      owner_id: string | null;
      species_entry?: { id: string | null; name: string | null; normalized_name: string | null } | null;
      owner: { id: string | null; username: string | null } | null;
    } | null;
  }[];

  const suitMap = new Map<
    string,
    {
      name: string;
      species: string | null;
      speciesId: string | null;
      avatarUrl: string | null;
      ownerProfileId: string | null;
      ownerUsername: string | null;
    }
  >();

  for (const entry of suitEntries) {
    const suit = entry?.fursuit;
    if (!suit || !suit.id || !suit.name) {
      continue;
    }

    suitMap.set(suit.id, {
      name: suit.name,
      species: suit.species_entry?.name ?? suit.species ?? null,
      speciesId: suit.species_entry?.id ?? suit.species_id ?? null,
      avatarUrl: suit.avatar_url ?? null,
      ownerProfileId: suit.owner_id ?? null,
      ownerUsername: suit.owner?.username ?? null,
    });
  }

  const suitIds = Array.from(suitMap.keys());

  if (suitIds.length === 0) {
    return [];
  }

  const { data: catchRows, error: catchError } = await client
    .from('catches')
    .select('fursuit_id')
    .in('fursuit_id', suitIds);

  if (catchError) {
    throw new Error(`We couldn't load suit catches: ${catchError.message}`);
  }

  const catchEntries = (catchRows ?? []) as { fursuit_id: string | null }[];
  const catchCounts = new Map<string, number>();

  for (const row of catchEntries) {
    const suitId = row.fursuit_id;
    if (!suitId) {
      continue;
    }
    catchCounts.set(suitId, (catchCounts.get(suitId) ?? 0) + 1);
  }

  const entries = suitIds
    .map((suitId) => {
      const suit = suitMap.get(suitId);
      return {
        fursuitId: suitId,
        name: suit?.name ?? 'Unknown suit',
        species: suit?.species ?? null,
        speciesId: suit?.speciesId ?? null,
        avatarUrl: suit?.avatarUrl ?? null,
        ownerProfileId: suit?.ownerProfileId ?? null,
        ownerUsername: suit?.ownerUsername ?? null,
        catchCount: catchCounts.get(suitId) ?? 0,
      } satisfies SuitLeaderboardEntry;
    })
    .filter((entry) => entry.catchCount > 0);

  return entries.sort((a, b) => {
    if (b.catchCount !== a.catchCount) {
      return b.catchCount - a.catchCount;
    }

    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();

    if (nameA && nameB && nameA !== nameB) {
      return nameA < nameB ? -1 : 1;
    }

    return a.fursuitId < b.fursuitId ? -1 : 1;
  });
}

export const createConventionSuitLeaderboardQueryOptions = (conventionId: string) => ({
  queryKey: conventionSuitLeaderboardQueryKey(conventionId),
  queryFn: () => fetchConventionSuitLeaderboard(conventionId),
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
