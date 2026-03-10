import { supabase } from '../../../lib/supabase';

export const PUBLIC_PROFILE_CATCH_COUNT_KEY = 'public-profile-catch-count';
export const PUBLIC_PROFILE_CONVENTION_COUNT_KEY = 'public-profile-convention-count';

export const publicProfileCatchCountKey = (userId: string) =>
  [PUBLIC_PROFILE_CATCH_COUNT_KEY, userId] as const;

export const publicProfileConventionCountKey = (userId: string) =>
  [PUBLIC_PROFILE_CONVENTION_COUNT_KEY, userId] as const;

export async function fetchUserCatchCount(userId: string): Promise<number> {
  const client = supabase as any;
  const { count, error } = await client
    .from('catches')
    .select('id', { count: 'exact', head: true })
    .eq('catcher_id', userId)
    .eq('status', 'ACCEPTED');

  if (error) {
    throw new Error(`Could not load catch count: ${error.message}`);
  }

  return count ?? 0;
}

export async function fetchUserConventionCount(userId: string): Promise<number> {
  const client = supabase as any;
  const { count, error } = await client
    .from('profile_conventions')
    .select('convention_id', { count: 'exact', head: true })
    .eq('profile_id', userId);

  if (error) {
    throw new Error(`Could not load convention count: ${error.message}`);
  }

  return count ?? 0;
}

export const createUserCatchCountQueryOptions = (userId: string) => ({
  queryKey: publicProfileCatchCountKey(userId),
  queryFn: () => fetchUserCatchCount(userId),
  staleTime: 2 * 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

export const createUserConventionCountQueryOptions = (userId: string) => ({
  queryKey: publicProfileConventionCountKey(userId),
  queryFn: () => fetchUserConventionCount(userId),
  staleTime: 5 * 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
