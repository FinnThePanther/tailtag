import { supabase } from '../../../lib/supabase';
import { captureSupabaseError } from '../../../lib/sentry';
type UserRole = 'player' | 'staff' | 'moderator' | 'organizer' | 'owner';

export type ProfileSummary = {
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_new: boolean;
  onboarding_completed: boolean;
  role?: UserRole;
};

export const PROFILE_QUERY_KEY = 'profile';
export const PROFILE_STALE_TIME = 2 * 60_000;

export const profileQueryKey = (userId: string) => [PROFILE_QUERY_KEY, userId] as const;

export async function fetchProfile(userId: string): Promise<ProfileSummary | null> {
  const client = supabase as any;
  const { data, error } = await client
    .from('profiles')
    .select('username, bio, avatar_url, is_new, onboarding_completed, role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    captureSupabaseError(error, {
      scope: 'profile.fetchProfile',
      action: 'select',
      userId,
    });
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return {
    username: data.username ?? null,
    bio: data.bio ?? null,
    avatar_url: data.avatar_url ?? null,
    is_new: data.is_new === true,
    onboarding_completed: data.onboarding_completed === true,
    role: data.role ?? undefined,
  };
}

export const createProfileQueryOptions = (userId: string) => ({
  queryKey: profileQueryKey(userId),
  queryFn: () => fetchProfile(userId),
  staleTime: PROFILE_STALE_TIME,
  gcTime: 5 * 60_000, // Keep cache for 5 minutes even when unmounted
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
