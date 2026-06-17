import { supabase } from '../../../lib/supabase';
import {
  applyProfileSocialLinksToBio,
  mapFursuitConventionAppearances,
  mapFursuitColors,
  mapFursuitMakers,
  mapLatestFursuitBio,
  parseSocialLinks,
} from './utils';
import type { Database } from '@/types/database';
import type { FursuitDetail } from '../types';
import { captureHandledMessage, captureSupabaseError } from '../../../lib/sentry';
import { FURSUIT_BUCKET } from '../../../constants/storage';
import { resolveStorageMediaUrl } from '../../../utils/supabase-image';
import { normalizeVisibilityAudience } from '@/features/adult-boundary';
import {
  normalizeInteractionBadges,
  normalizeSocialSignal,
} from '@/features/interaction-preferences';

export const FURSUIT_DETAIL_QUERY_KEY = 'fursuit-detail';
export const fursuitDetailQueryKey = (fursuitId: string, viewerId?: string | null) =>
  viewerId
    ? ([FURSUIT_DETAIL_QUERY_KEY, fursuitId, viewerId] as const)
    : ([FURSUIT_DETAIL_QUERY_KEY, fursuitId] as const);

type FursuitDetailRpcRow =
  Database['public']['Functions']['get_fursuit_detail']['Returns'][number] & {
    owner_id: string | null;
    unique_code: string | null;
  };

const isSpeciesEntry = (value: unknown): value is { id: string; name: string } =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'string' &&
  'name' in value &&
  typeof value.name === 'string';

export async function fetchFursuitDetail(
  fursuitId: string,
  _viewerId?: string | null,
): Promise<FursuitDetail> {
  const { data, error } = await supabase.rpc('get_fursuit_detail', {
    p_fursuit_id: fursuitId,
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'suits.fetchFursuitDetail',
      fursuitId,
    });
    throw new Error("We couldn't load that fursuit right now. Please try again.");
  }

  const row = (Array.isArray(data) ? data[0] : data) as FursuitDetailRpcRow | null;

  if (!row) {
    captureHandledMessage(
      'Fursuit detail not found',
      {
        scope: 'suits.fetchFursuitDetail',
        fursuitId,
      },
      'warning',
    );
    throw new Error('Fursuit unavailable');
  }

  const conventions = mapFursuitConventionAppearances(row.fursuit_conventions ?? []);

  const profileSocialLinks = parseSocialLinks(row.owner_social_links ?? null);
  const bio = applyProfileSocialLinksToBio(
    mapLatestFursuitBio(row.fursuit_bio ?? null),
    profileSocialLinks,
  );
  const speciesEntry = isSpeciesEntry(row.species_entry) ? row.species_entry : null;
  const speciesName = speciesEntry?.name ?? null;
  const speciesId = speciesEntry?.id ?? row.species_id ?? null;
  const colors = mapFursuitColors(row.color_assignments ?? null);
  const makers = mapFursuitMakers(row.makers ?? null);

  let resolvedCatchCount = typeof row.catch_count === 'number' ? row.catch_count : 0;

  if (resolvedCatchCount <= 0) {
    const { count: fallbackCount, error: fallbackError } = await supabase
      .from('catches')
      .select('id', { head: true, count: 'exact' })
      .eq('fursuit_id', row.id)
      .eq('status', 'ACCEPTED');

    if (fallbackError) {
      // Non-critical: fallback count is best-effort
    } else if (typeof fallbackCount === 'number') {
      resolvedCatchCount = fallbackCount;
    }
  }

  return {
    id: row.id,
    owner_id: row.owner_id,
    name: row.name,
    species: speciesName,
    speciesId: speciesId,
    colors,
    avatar_path: row.avatar_path ?? null,
    avatar_url: resolveStorageMediaUrl({
      bucket: FURSUIT_BUCKET,
      path: row.avatar_path ?? null,
      legacyUrl: row.avatar_url ?? null,
    }),
    description: row.description ?? null,
    unique_code: row.unique_code ?? null,
    visibility_audience: normalizeVisibilityAudience(row.visibility_audience),
    ownerAttributionVisibility: row.owner_attribution_visibility === 'hidden' ? 'hidden' : 'public',
    socialSignal: normalizeSocialSignal(row.social_signal),
    interactionBadges: normalizeInteractionBadges(row.interaction_badges),
    catchCount: resolvedCatchCount,
    created_at: row.created_at ?? null,
    conventions,
    makers,
    bio,
  } satisfies FursuitDetail;
}
