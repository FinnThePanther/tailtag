import { supabase } from '../../../lib/supabase';
type UserRole = 'player' | 'staff' | 'moderator' | 'organizer' | 'owner';

export type ProfileSummary = {
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_new: boolean;
  onboarding_completed: boolean;
  role?: UserRole;
  push_notifications_enabled?: boolean;
  push_notifications_prompted?: boolean;
};

export const PROFILE_QUERY_KEY = 'profile';
export const PROFILE_STALE_TIME = 2 * 60_000;

export const profileQueryKey = (userId: string) => [PROFILE_QUERY_KEY, userId] as const;

export async function fetchProfile(userId: string): Promise<ProfileSummary | null> {
  const client = supabase as any;
  const { data, error } = await client
    .from('profiles')
    .select('username, bio, avatar_url, is_new, onboarding_completed, role, push_notifications_enabled, push_notifications_prompted')
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
    is_new: data.is_new === true,
    onboarding_completed: data.onboarding_completed === true,
    role: data.role ?? undefined,
    push_notifications_enabled: data.push_notifications_enabled ?? false,
    push_notifications_prompted: data.push_notifications_prompted ?? false,
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
