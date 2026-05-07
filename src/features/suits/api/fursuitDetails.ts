import { supabase } from '../../../lib/supabase';
import { mapFursuitColors, mapLatestFursuitBio } from './utils';
import { fetchFursuitMakersByFursuitIds } from './makers';
import type { FursuitDetail } from '../types';
import { captureHandledMessage } from '../../../lib/sentry';
import { FURSUIT_BUCKET } from '../../../constants/storage';
import { resolveStorageMediaUrl } from '../../../utils/supabase-image';

export const FURSUIT_DETAIL_QUERY_KEY = 'fursuit-detail';
export const fursuitDetailQueryKey = (fursuitId: string) =>
  [FURSUIT_DETAIL_QUERY_KEY, fursuitId] as const;

export async function fetchFursuitDetail(fursuitId: string): Promise<FursuitDetail> {
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
      is_tutorial,
      description,
      unique_code,
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
        catchable_now,
        catchable_updated_at,
        convention:conventions (
          id,
          slug,
          name,
          location,
          start_date,
          end_date,
          timezone,
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
      )
    `,
    )
    .eq('id', fursuitId)
    .eq('is_tutorial', false)
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
    throw new Error('That fursuit was not found. It may have been removed.');
  }

  const conventions = (data.fursuit_conventions ?? [])
    .filter((entry: any) => Boolean(entry?.convention))
    .map((entry: any) => ({
      id: entry.convention.id,
      slug: entry.convention.slug,
      name: entry.convention.name,
      location: entry.convention.location ?? null,
      start_date: entry.convention.start_date ?? null,
      end_date: entry.convention.end_date ?? null,
      timezone: entry.convention.timezone ?? 'UTC',
      latitude: entry.convention.latitude ?? null,
      longitude: entry.convention.longitude ?? null,
      geofence_radius_meters: entry.convention.geofence_radius_meters ?? null,
      geofence_enabled: Boolean(entry.convention.geofence_enabled),
      location_verification_required: Boolean(entry.convention.location_verification_required),
      roster_visible: entry.roster_visible !== false,
      catchable_now: entry.catchable_now === true,
      catchable_updated_at: entry.catchable_updated_at ?? null,
    }));

  const bio = mapLatestFursuitBio(data.fursuit_bios ?? null);
  const speciesEntry = data.species_entry ?? null;
  const speciesName = speciesEntry?.name ?? null;
  const speciesId = speciesEntry?.id ?? data.species_id ?? null;
  const colors = mapFursuitColors(data.color_assignments ?? null);
  const makersByFursuitId = await fetchFursuitMakersByFursuitIds([data.id]);
  const makers = makersByFursuitId.get(data.id) ?? [];

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
    unique_code: data.unique_code ?? null,
    catchCount: resolvedCatchCount,
    created_at: data.created_at ?? null,
    conventions,
    makers,
    bio,
  } satisfies FursuitDetail;
}
