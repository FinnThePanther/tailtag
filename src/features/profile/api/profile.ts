import { supabase } from '../../../lib/supabase';
import { PROFILE_AVATAR_BUCKET } from '../../../constants/storage';
import { loadUriAsUint8Array } from '../../../utils/files';
import { processImageForUpload, IMAGE_UPLOAD_PRESETS } from '../../../utils/images';
import type { FursuitPhotoCandidate } from '../../onboarding/api/onboarding';
import type { FursuitSocialLink } from '../../../types/database';
import {
  buildGeneratedUsername,
  normalizeUsernameInput,
  toValidUsernameOrNull,
  validateUsername,
} from '../usernameRules';

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
  is_suspended?: boolean;
  suspended_until?: string | null;
  suspension_reason?: string | null;
};

export const PROFILE_QUERY_KEY = 'profile';
export const PROFILE_STALE_TIME = 2 * 60_000;

export const profileQueryKey = (userId: string) => [PROFILE_QUERY_KEY, userId] as const;

// Stable columns that have always existed — used as fallback when new columns aren't migrated yet.
const STABLE_COLUMNS = 'username, bio, is_new, onboarding_completed, role, push_notifications_enabled, push_notifications_prompted';
const FULL_COLUMNS = `${STABLE_COLUMNS}, avatar_url, social_links, is_suspended, suspended_until, suspension_reason`;
const NEW_USER_PROFILE_RETRY_DELAYS_MS = [150, 500] as const;
const PROFILE_AVATAR_PUBLIC_PATH = `/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function selectProfileRow(columns: string, userId: string) {
  const client = supabase as any;
  return client
    .from('profiles')
    .select(columns)
    .eq('id', userId)
    .maybeSingle();
}

async function selectProfileWithColumnFallback(userId: string) {
  const { data, error } = await selectProfileRow(FULL_COLUMNS, userId);

  if (error?.code === '42703') {
    const { data: fallback, error: fallbackError } = await selectProfileRow(STABLE_COLUMNS, userId);

    if (fallbackError) {
      throw new Error(fallbackError.message);
    }

    return {
      data: fallback,
      usedFallbackColumns: true,
    };
  }

  if (error) {
    throw new Error(error.message);
  }

  return {
    data,
    usedFallbackColumns: false,
  };
}

async function ensureOwnProfileExists(userId: string): Promise<void> {
  const client = supabase as any;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user.id !== userId) {
    return;
  }

  const username =
    typeof session.user.user_metadata?.username === 'string'
      ? toValidUsernameOrNull(session.user.user_metadata.username)
      : null;

  const payload: { id: string; username?: string } = {
    id: userId,
  };

  if (username) {
    payload.username = username;
  } else {
    const [emailLocalPart] = (session.user.email ?? '').split('@');
    payload.username = buildGeneratedUsername(emailLocalPart, {
      forceSuffix: true,
    });
  }

  const { error } = await client
    .from('profiles')
    .upsert(payload, { onConflict: 'id', ignoreDuplicates: true });

  if (error && error.code !== '23505') {
    throw new Error(error.message);
  }
}

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
    is_suspended: data.is_suspended ?? false,
    suspended_until: data.suspended_until ?? null,
    suspension_reason: data.suspension_reason ?? null,
    ...overrides,
  };
}

export async function fetchProfile(userId: string): Promise<ProfileSummary | null> {
  let result = await selectProfileWithColumnFallback(userId);

  if (!result.data) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const isCurrentUser = session?.user.id === userId;

    if (isCurrentUser) {
      for (const delayMs of NEW_USER_PROFILE_RETRY_DELAYS_MS) {
        await sleep(delayMs);
        result = await selectProfileWithColumnFallback(userId);

        if (result.data) {
          break;
        }
      }

      if (!result.data) {
        await ensureOwnProfileExists(userId);
        result = await selectProfileWithColumnFallback(userId);
      }
    }
  }

  if (!result.data) {
    return null;
  }

  if (result.usedFallbackColumns) {
    return mapProfileData(result.data, { avatar_url: null, social_links: [] });
  }

  return mapProfileData(result.data);
}

export async function uploadProfileAvatar(
  userId: string,
  photo: FursuitPhotoCandidate,
): Promise<string> {
  const processed = await processImageForUpload(photo.uri, IMAGE_UPLOAD_PRESETS.profileAvatar);

  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storagePath = `${userId}/${uniqueSuffix}.jpg`;

  const fileBytes = await loadUriAsUint8Array(processed.uri);

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .upload(storagePath, fileBytes, {
      contentType: 'image/jpeg',
      upsert: false,
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

export function hasUploadedProfileAvatar(
  avatarUrl: string | null | undefined,
): boolean {
  if (typeof avatarUrl !== 'string') {
    return false;
  }

  const trimmed = avatarUrl.trim();
  return trimmed.length > 0 && trimmed.includes(PROFILE_AVATAR_PUBLIC_PATH);
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
  const normalized = normalizeUsernameInput(username);
  const validation = validateUsername(normalized);

  if (!validation.isValid) {
    return false;
  }

  const { data, error } = await (supabase as any).rpc('is_username_available', {
    p_username: normalized,
    p_current_user_id: currentUserId,
  });

  if (error) {
    if (error.code === '42883') {
      // Fallback for environments that haven't applied the migration yet.
      const { data: fallbackData, error: fallbackError } = await (supabase as any)
        .from('profiles')
        .select('id')
        .eq('username', normalized)
        .neq('id', currentUserId)
        .maybeSingle();

      if (fallbackError) {
        throw new Error(fallbackError.message);
      }

      return fallbackData === null;
    }

    throw new Error(error.message);
  }

  return data === true;
}

export const createProfileQueryOptions = (userId: string) => ({
  queryKey: profileQueryKey(userId),
  queryFn: () => fetchProfile(userId),
  staleTime: PROFILE_STALE_TIME,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
