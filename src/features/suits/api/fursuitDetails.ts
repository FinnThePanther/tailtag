import { supabase } from '../../../lib/supabase';
import {
  applyProfileSocialLinksToBio,
  mapFursuitConventionAppearances,
  mapFursuitColors,
  mapLatestFursuitBio,
  parseSocialLinks,
} from './utils';
import { fetchFursuitMakersByFursuitIds } from './makers';
import type { FursuitDetail } from '../types';
import { captureHandledMessage } from '../../../lib/sentry';
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
  viewerId?: string | null,
): Promise<FursuitDetail> {
  const client = supabase as any;
  const { data, error } = await client
    .from('fursuits')
    .select(
      `
      id,
      owner_id,
      name,
      species_id,
      avatar_path,
      avatar_url,
      description,
      visibility_audience,
      catch_count,
      created_at,
      species_entry:fursuit_species (
        id,
        name,
        normalized_name
      ),
      color_assignments:fursuit_color_assignments (
        position,
        color:fursuit_colors (
          id,
          name,
          normalized_name
        )
      ),
      fursuit_conventions:fursuit_conventions (
        roster_visible,
        roster_state,
        active_until,
        convention:conventions (
          id,
          slug,
          name,
          location,
          start_date,
          end_date,
          timezone,
          status,
          finalizing_started_at,
          closeout_not_before,
          latitude,
          longitude,
          geofence_radius_meters,
          geofence_enabled,
          location_verification_required
        )
      ),
      fursuit_bios (
        version,
        owner_name,
        photo_credit,
        pronouns,
        likes_and_interests,
        ask_me_about,
        social_links,
        created_at,
        updated_at
      ),
      owner_profile:profiles!fursuits_owner_id_fkey (
        social_links
      )
    `,
    )
    .eq('id', fursuitId)
    .maybeSingle();

  if (error) {
    throw new Error("We couldn't load that fursuit right now. Please try again.");
  }

  if (!data) {
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

  const conventions = mapFursuitConventionAppearances(data.fursuit_conventions ?? []);

  const profileSocialLinks = parseSocialLinks(data.owner_profile?.social_links ?? null);
  const bio = applyProfileSocialLinksToBio(
    mapLatestFursuitBio(data.fursuit_bios ?? null),
    profileSocialLinks,
  );
  const speciesEntry = data.species_entry ?? null;
  const speciesName = speciesEntry?.name ?? null;
  const speciesId = speciesEntry?.id ?? data.species_id ?? null;
  const colors = mapFursuitColors(data.color_assignments ?? null);
  const makersByFursuitId = await fetchFursuitMakersByFursuitIds([data.id]);
  const makers = makersByFursuitId.get(data.id) ?? [];
  let uniqueCode: string | null = null;

  if (viewerId && data.owner_id === viewerId) {
    const { data: codeData, error: codeError } = await client
      .from('fursuits')
      .select('unique_code')
      .eq('id', data.id)
      .eq('owner_id', viewerId)
      .maybeSingle();

    if (codeError) {
      throw new Error("We couldn't load that fursuit right now. Please try again.");
    }

    uniqueCode = codeData?.unique_code ?? null;
  }

  let resolvedCatchCount = typeof data.catch_count === 'number' ? data.catch_count : 0;

  if (resolvedCatchCount <= 0) {
    const { count: fallbackCount, error: fallbackError } = await client
      .from('catches')
      .select('id', { head: true, count: 'exact' })
      .eq('fursuit_id', data.id)
      .eq('status', 'ACCEPTED');

    if (fallbackError) {
      // Non-critical: fallback count is best-effort
    } else if (typeof fallbackCount === 'number') {
      resolvedCatchCount = fallbackCount;
    }
  }

  return {
    id: data.id,
    owner_id: data.owner_id,
    name: data.name,
    species: speciesName,
    speciesId: speciesId,
    colors,
    avatar_path: data.avatar_path ?? null,
    avatar_url: resolveStorageMediaUrl({
      bucket: FURSUIT_BUCKET,
      path: data.avatar_path ?? null,
      legacyUrl: data.avatar_url ?? null,
    }),
    description: data.description ?? null,
    unique_code: uniqueCode,
    visibility_audience: normalizeVisibilityAudience(data.visibility_audience),
    catchCount: resolvedCatchCount,
    created_at: data.created_at ?? null,
    conventions,
    makers,
    bio,
  } satisfies FursuitDetail;
}
