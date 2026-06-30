import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { VisibilityAudience } from '@/features/adult-boundary';
import type { InteractionBadgeKey, SocialSignalKey } from '@/features/interaction-preferences';
import { captureSupabaseError } from '@/lib/sentry';
import { supabase } from '@/lib/supabase';
import { normalizeUniqueCodeInput } from '@/utils/code';

export type UpdateFursuitProfileResult =
  | {
      status: 'updated';
      fursuitId: string;
      uniqueCode: string;
    }
  | {
      status: 'code_taken';
      fursuitId: string;
      uniqueCode: string;
    }
  | {
      status: 'code_change_locked';
      fursuitId: string;
      uniqueCode: string;
    }
  | {
      status: 'code_invalid';
      fursuitId: string;
      uniqueCode: string;
    }
  | {
      status: 'not_found';
      fursuitId: string;
      uniqueCode: null;
    };

export interface UpdateFursuitProfileInput {
  fursuitId: string;
  name: string;
  speciesId: string;
  visibilityAudience: VisibilityAudience;
  ownerAttributionVisibility: 'public' | 'hidden';
  socialSignal: SocialSignalKey | null;
  interactionBadges: InteractionBadgeKey[];
  colorDetails: string | null;
  uniqueCode: string;
  avatarPath?: string | null;
  avatarUrl?: string | null;
  avatarChanged: boolean;
  clientAttemptId?: string;
}

interface RawUpdateFursuitProfileResult {
  status?: unknown;
  fursuit_id?: unknown;
  unique_code?: unknown;
}

const parseUpdateFursuitProfileResult = (value: unknown): UpdateFursuitProfileResult => {
  if (!value || typeof value !== 'object') {
    throw new Error('Malformed update_fursuit_profile response');
  }

  const result = value as RawUpdateFursuitProfileResult;
  const fursuitId = typeof result.fursuit_id === 'string' ? result.fursuit_id : null;

  if (!fursuitId) {
    throw new Error('Malformed update_fursuit_profile response');
  }

  if (result.status === 'not_found') {
    return {
      status: 'not_found',
      fursuitId,
      uniqueCode: null,
    };
  }

  const uniqueCode = typeof result.unique_code === 'string' ? result.unique_code : null;

  if (!uniqueCode) {
    throw new Error('Malformed update_fursuit_profile response');
  }

  if (
    result.status === 'updated' ||
    result.status === 'code_taken' ||
    result.status === 'code_change_locked' ||
    result.status === 'code_invalid'
  ) {
    return {
      status: result.status,
      fursuitId,
      uniqueCode,
    };
  }

  throw new Error('Malformed update_fursuit_profile response');
};

const createFursuitEditClientAttemptId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `fursuit-edit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const getClientAppVersion = () =>
  Constants.expoConfig?.version ??
  Constants.expoConfig?.runtimeVersion?.toString() ??
  Constants.expoConfig?.extra?.appVersion ??
  null;

export async function updateFursuitProfile(
  input: UpdateFursuitProfileInput,
): Promise<UpdateFursuitProfileResult> {
  const normalizedCode = normalizeUniqueCodeInput(input.uniqueCode);
  const clientAttemptId = input.clientAttemptId ?? createFursuitEditClientAttemptId();
  const { data, error } = await (supabase as any).rpc('update_fursuit_profile', {
    p_fursuit_id: input.fursuitId,
    p_name: input.name,
    p_species_id: input.speciesId,
    p_visibility_audience: input.visibilityAudience,
    p_owner_attribution_visibility: input.ownerAttributionVisibility,
    p_social_signal: input.socialSignal,
    p_interaction_badges: input.interactionBadges,
    p_color_details: input.colorDetails,
    p_unique_code: normalizedCode,
    p_avatar_path: input.avatarPath ?? null,
    p_avatar_url: input.avatarUrl ?? null,
    p_avatar_changed: input.avatarChanged,
    p_client_attempt_id: clientAttemptId,
    p_client_app_version: getClientAppVersion(),
    p_client_platform: Platform.OS,
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'suits.updateFursuitProfile',
      action: 'update_fursuit_profile',
      rpc: 'update_fursuit_profile',
      fursuitId: input.fursuitId,
      speciesId: input.speciesId,
      avatarChanged: input.avatarChanged,
      uniqueCode: normalizedCode,
      clientAttemptId,
      platform: Platform.OS,
    });
    throw error;
  }

  return parseUpdateFursuitProfileResult(data);
}
