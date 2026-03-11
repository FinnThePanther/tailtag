import { supabase } from '../../../lib/supabase';
import { PROFILE_AVATAR_BUCKET, MAX_IMAGE_SIZE } from '../../../constants/storage';
import { loadUriAsUint8Array } from '../../../utils/files';
import { inferImageExtension } from '../../../utils/images';
import type { FursuitPhotoCandidate } from '../../onboarding/api/onboarding';
import type { FursuitSocialLink } from '../../../types/database';

type UserRole = 'player' | 'staff' | 'moderator' | 'organizer' | 'owner';

export type ProfileSummary = {
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  social_links: FursuitSocialLink[];
  is_new: boolean;
  onboarding_completed: boolean;
  role?: UserRole;
  push_notifications_enabled?: boolean;
  push_notifications_prompted?: boolean;
};

export const PROFILE_QUERY_KEY = 'profile';
export const PROFILE_STALE_TIME = 2 * 60_000;

export const profileQueryKey = (userId: string) => [PROFILE_QUERY_KEY, userId] as const;

// Stable columns that have always existed — used as fallback when new columns aren't migrated yet.
const STABLE_COLUMNS = 'username, bio, is_new, onboarding_completed, role, push_notifications_enabled, push_notifications_prompted';
const FULL_COLUMNS = `${STABLE_COLUMNS}, avatar_url, social_links`;

function mapProfileData(data: any, overrides: Partial<ProfileSummary> = {}): ProfileSummary {
  return {
    username: data.username ?? null,
    bio: data.bio ?? null,
    avatar_url: data.avatar_url ?? null,
    social_links: Array.isArray(data.social_links) ? (data.social_links as FursuitSocialLink[]) : [],
    is_new: data.is_new === true,
    onboarding_completed: data.onboarding_completed === true,
    role: data.role ?? undefined,
    push_notifications_enabled: data.push_notifications_enabled ?? false,
    push_notifications_prompted: data.push_notifications_prompted ?? false,
    ...overrides,
  };
}

export async function fetchProfile(userId: string): Promise<ProfileSummary | null> {
  const client = supabase as any;
  const { data, error } = await client
    .from('profiles')
    .select(FULL_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  // One or more new columns may not exist yet (migration pending).
  // Fall back to only the stable columns so the app keeps working.
  if (error?.code === '42703') {
    const { data: fallback, error: fallbackError } = await client
      .from('profiles')
      .select(STABLE_COLUMNS)
      .eq('id', userId)
      .maybeSingle();

    if (fallbackError) throw new Error(fallbackError.message);
    if (!fallback) return null;

    return mapProfileData(fallback, { avatar_url: null, social_links: [] });
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return mapProfileData(data);
}

export async function uploadProfileAvatar(
  userId: string,
  photo: FursuitPhotoCandidate,
): Promise<string> {
  if (photo.fileSize > MAX_IMAGE_SIZE) {
    throw new Error('Profile photos must be 5MB or smaller.');
  }

  const extension = inferImageExtension(photo);
  const storagePath = `${userId}/avatar.${extension}`;

  const fileBytes = await loadUriAsUint8Array(photo.uri);

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .upload(storagePath, fileBytes, {
      contentType: photo.mimeType,
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(storagePath);

  return publicUrl;
}

export async function updateProfileAvatar(
  userId: string,
  avatarUrl: string,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('profiles')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    throw new Error(`Could not save avatar: ${error.message}`);
  }
}

export async function updateProfileSocialLinks(
  userId: string,
  links: FursuitSocialLink[],
): Promise<void> {
  const { error } = await (supabase as any)
    .from('profiles')
    .update({ social_links: links, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    throw new Error(`Could not save social links: ${error.message}`);
  }
}

export async function checkUsernameAvailability(
  username: string,
  currentUserId: string
): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from('profiles')
    .select('id')
    .ilike('username', username)
    .neq('id', currentUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data === null;
}

export const createProfileQueryOptions = (userId: string) => ({
  queryKey: profileQueryKey(userId),
  queryFn: () => fetchProfile(userId),
  staleTime: PROFILE_STALE_TIME,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
