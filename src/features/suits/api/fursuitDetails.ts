import { supabase } from '../../../lib/supabase';
import {
  applyProfileSocialLinksToBio,
  mapFursuitConventionAppearances,
  mapFursuitColors,
  mapFursuitMakers,
  mapLatestFursuitBio,
  parseSocialLinks,
} from './utils';
import type { FursuitDetail } from '../types';
import { captureHandledMessage, captureSupabaseError } from '../../../lib/sentry';
import { FURSUIT_BUCKET } from '../../../constants/storage';
import { resolveStorageMediaUrl } from '../../../utils/supabase-image';
import { normalizeVisibilityAudience } from '@/features/adult-boundary';

export const FURSUIT_DETAIL_QUERY_KEY = 'fursuit-detail';
export const fursuitDetailQueryKey = (fursuitId: string, viewerId?: string | null) =>
  viewerId
    ? ([FURSUIT_DETAIL_QUERY_KEY, fursuitId, viewerId] as const)
    : ([FURSUIT_DETAIL_QUERY_KEY, fursuitId] as const);

export async function fetchFursuitDetail(
  fursuitId: string,
  _viewerId?: string | null,
): Promise<FursuitDetail> {
  const client = supabase as any;
  const { data, error } = await client.rpc('get_fursuit_detail', {
    p_fursuit_id: fursuitId,
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'suits.fetchFursuitDetail',
      fursuitId,
    });
    throw new Error("We couldn't load that fursuit right now. Please try again.");
  }

  const row = Array.isArray(data) ? data[0] : data;

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
  const speciesEntry = row.species_entry ?? null;
  const speciesName = speciesEntry?.name ?? null;
  const speciesId = speciesEntry?.id ?? row.species_id ?? null;
  const colors = mapFursuitColors(row.color_assignments ?? null);
  const makers = mapFursuitMakers(row.makers ?? null);

  let resolvedCatchCount = typeof row.catch_count === 'number' ? row.catch_count : 0;

  if (resolvedCatchCount <= 0) {
    const { count: fallbackCount, error: fallbackError } = await client
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
    catchCount: resolvedCatchCount,
    created_at: row.created_at ?? null,
    conventions,
    makers,
    bio,
  } satisfies FursuitDetail;
}
