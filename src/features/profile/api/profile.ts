import { supabase } from '../../../lib/supabase';
import { PROFILE_AVATAR_BUCKET } from '../../../constants/storage';
import { loadUriAsUint8Array } from '../../../utils/files';
import { processImageForUpload, IMAGE_UPLOAD_PRESETS } from '../../../utils/images';
import {
  buildAuthenticatedStorageObjectUrl,
  resolveStorageMediaUrl,
} from '../../../utils/supabase-image';
import type { FursuitPhotoCandidate } from '../../onboarding/api/onboarding';
import type { Database, FursuitSocialLink } from '../../../types/database';
import {
  buildGeneratedUsername,
  normalizeUsernameForLookup,
  normalizeUsernameInput,
  toValidUsernameOrNull,
  validateUsername,
} from '../usernameRules';

type UserRole = 'player' | 'staff' | 'moderator' | 'organizer' | 'owner';
export type CatchMode = Database['public']['Enums']['catch_mode'];
export type CatchModePreferenceSource =
  | 'system_default'
  | 'migrated_from_suits'
  | 'experiment_default'
  | 'user_selected';

export type CatchModeExperimentAssignment = {
  experimentKey: string;
  variant: 'auto_default' | 'manual_default';
  profileId: string;
  previousCatchMode: CatchMode;
  currentCatchMode: CatchMode;
  previousPreferenceSource: CatchModePreferenceSource;
  currentPreferenceSource: CatchModePreferenceSource;
  assignmentCreated: boolean;
  defaultApplied: boolean;
  exposedAt: string;
};

export type ProfileSummary = {
  username: string | null;
  bio: string | null;
  avatar_path?: string | null;
  avatar_url: string | null;
  social_links: FursuitSocialLink[];
  default_catch_mode: CatchMode;
  catch_mode_preference_source: CatchModePreferenceSource;
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
const STABLE_COLUMNS =
  'username, bio, is_new, onboarding_completed, role, push_notifications_enabled, push_notifications_prompted';
const FULL_COLUMNS = `${STABLE_COLUMNS}, avatar_url, avatar_path, social_links, default_catch_mode, catch_mode_preference_source, is_suspended, suspended_until, suspension_reason`;
const NEW_USER_PROFILE_RETRY_DELAYS_MS = [150, 500] as const;

const normalizeCatchMode = (value: unknown): CatchMode =>
  value === 'MANUAL_APPROVAL' ? 'MANUAL_APPROVAL' : 'AUTO_ACCEPT';

const normalizeCatchModePreferenceSource = (value: unknown): CatchModePreferenceSource => {
  switch (value) {
    case 'migrated_from_suits':
    case 'experiment_default':
    case 'user_selected':
      return value;
    default:
      return 'system_default';
  }
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function selectProfileRow(columns: string, userId: string) {
  const client = supabase as any;
  return client.from('profiles').select(columns).eq('id', userId).maybeSingle();
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
  const avatarPath = data.avatar_path ?? null;
  const avatarUrl = resolveStorageMediaUrl({
    bucket: PROFILE_AVATAR_BUCKET,
    path: avatarPath,
    legacyUrl: data.avatar_url ?? null,
  });

  return {
    username: data.username ?? null,
    bio: data.bio ?? null,
    avatar_path: avatarPath,
    avatar_url: avatarUrl,
    social_links: Array.isArray(data.social_links)
      ? (data.social_links as FursuitSocialLink[])
      : [],
    default_catch_mode: normalizeCatchMode(data.default_catch_mode),
    catch_mode_preference_source: normalizeCatchModePreferenceSource(
      data.catch_mode_preference_source,
    ),
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

  return storagePath;
}

export async function updateProfileAvatar(userId: string, avatarPath: string): Promise<void> {
  const avatarUrl = buildAuthenticatedStorageObjectUrl(PROFILE_AVATAR_BUCKET, avatarPath);

  const { error } = await (supabase as any)
    .from('profiles')
    .update({
      avatar_path: avatarPath,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(`Could not save avatar: ${error.message}`);
  }
}

export function hasUploadedProfileAvatar(
  avatarUrl: string | null | undefined,
  avatarPath?: string | null | undefined,
): boolean {
  if (typeof avatarPath === 'string' && avatarPath.trim().length > 0) {
    return true;
  }

  if (typeof avatarUrl !== 'string') {
    return false;
  }

  const trimmed = avatarUrl.trim();
  return trimmed.length > 0;
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

export async function updateProfileCatchMode(userId: string, catchMode: CatchMode): Promise<void> {
  const { error } = await (supabase as any)
    .from('profiles')
    .update({
      default_catch_mode: catchMode,
      catch_mode_preference_source: 'user_selected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(`Could not save catch settings: ${error.message}`);
  }
}

function mapCatchModeExperimentAssignment(raw: any): CatchModeExperimentAssignment {
  return {
    experimentKey: String(raw.experiment_key ?? 'catch_mode_default_v1'),
    variant: raw.variant === 'manual_default' ? 'manual_default' : 'auto_default',
    profileId: String(raw.profile_id ?? ''),
    previousCatchMode: normalizeCatchMode(raw.previous_catch_mode),
    currentCatchMode: normalizeCatchMode(raw.current_catch_mode),
    previousPreferenceSource: normalizeCatchModePreferenceSource(raw.previous_preference_source),
    currentPreferenceSource: normalizeCatchModePreferenceSource(raw.current_preference_source),
    assignmentCreated: raw.assignment_created === true,
    defaultApplied: raw.default_applied === true,
    exposedAt:
      typeof raw.exposed_at === 'string' && raw.exposed_at.length > 0
        ? raw.exposed_at
        : new Date().toISOString(),
  };
}

export async function getOrAssignCatchModeDefaultExperiment(): Promise<CatchModeExperimentAssignment | null> {
  const { data, error } = await (supabase as any).rpc(
    'get_or_assign_catch_mode_default_experiment',
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return null;
  }

  return mapCatchModeExperimentAssignment(row);
}

export async function checkUsernameAvailability(
  username: string,
  currentUserId: string,
): Promise<boolean> {
  const normalized = normalizeUsernameInput(username);
  const lookupUsername = normalizeUsernameForLookup(username);
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
      const escapedUsername = lookupUsername.replace(/([_%\\])/g, '\\$1');
      const { data: fallbackData, error: fallbackError } = await (supabase as any)
        .from('profiles')
        .select('id')
        .ilike('username', escapedUsername)
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
