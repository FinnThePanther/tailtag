import { supabase } from '@/lib/supabase';
import { captureHandledException, captureSupabaseError } from '@/lib/sentry';

const isSupabaseError = (
  error: unknown,
): error is { code?: string; details?: string; hint?: string; message?: string } =>
  typeof error === 'object' &&
  error !== null &&
  'message' in error &&
  ('code' in error || 'details' in error || 'hint' in error);

export const FEATURE_FLAG_QUERY_KEY = 'feature-flag';
export const ANONYMOUS_FURSUITS_FEATURE_KEY = 'anonymous_fursuits';
export const PLAYER_LEVELING_UI_FEATURE_KEY = 'player_leveling_ui';

export const featureFlagQueryKey = (featureKey: string, profileId: string) =>
  [FEATURE_FLAG_QUERY_KEY, featureKey, profileId] as const;

export async function isFeatureEnabledForProfile(
  featureKey: string,
  profileId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_feature_enabled_for_profile', {
    p_feature_key: featureKey,
    p_profile_id: profileId,
  });

  if (error) {
    const context = {
      scope: 'featureFlags.isFeatureEnabledForProfile',
      featureKey,
      profileId,
    };

    if (isSupabaseError(error)) {
      captureSupabaseError(error, context, 'non-critical');
    } else {
      captureHandledException(error, context);
    }

    return false;
  }

  return data === true;
}
