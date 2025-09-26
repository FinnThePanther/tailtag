import { supabase } from '../../../lib/supabase';

export type ProfileSummary = {
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
};

export const PROFILE_QUERY_KEY = 'profile';
export const PROFILE_STALE_TIME = 2 * 60_000;

export const profileQueryKey = (userId: string) => [PROFILE_QUERY_KEY, userId] as const;

export async function fetchProfile(userId: string): Promise<ProfileSummary | null> {
  const client = supabase as any;
  const { data, error } = await client
    .from('profiles')
    .select('username, bio, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return {
    username: data.username ?? null,
    bio: data.bio ?? null,
    avatar_url: data.avatar_url ?? null,
  };
}

export const createProfileQueryOptions = (userId: string) => ({
  queryKey: profileQueryKey(userId),
  queryFn: () => fetchProfile(userId),
  staleTime: PROFILE_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
