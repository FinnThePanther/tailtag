import { supabase } from '../../../lib/supabase';

export const FEATURE_FLAG_QUERY_KEY = 'feature-flag';
export const ANONYMOUS_FURSUITS_FEATURE_KEY = 'anonymous_fursuits';

export const featureFlagQueryKey = (featureKey: string, profileId: string) =>
  [FEATURE_FLAG_QUERY_KEY, featureKey, profileId] as const;

export async function isFeatureEnabledForProfile(
  featureKey: string,
  profileId: string,
): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc('is_feature_enabled_for_profile', {
    p_feature_key: featureKey,
    p_profile_id: profileId,
  });

  if (error) {
    throw new Error(`We couldn't load feature access: ${error.message}`);
  }

  return data === true;
}
