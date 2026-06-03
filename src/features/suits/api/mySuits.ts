import { supabase } from '../../../lib/supabase';
import type { FursuitSummary } from '../types';
import {
  applyProfileSocialLinksToBio,
  mapFursuitConventionAppearances,
  mapFursuitColors,
  mapLatestFursuitBio,
  parseSocialLinks,
} from './utils';
import { fetchFursuitMakersByFursuitIds } from './makers';
import { FURSUIT_BUCKET } from '../../../constants/storage';
import { resolveStorageMediaUrl } from '../../../utils/supabase-image';
import { normalizeVisibilityAudience } from '@/features/adult-boundary';

export const MY_SUITS_QUERY_KEY = 'my-suits';
export const MY_SUITS_COUNT_QUERY_KEY = 'my-suits-count';
export const MY_SUITS_STALE_TIME = 2 * 60_000;

export const mySuitsQueryKey = (userId: string, includeUniqueCodes = true) =>
  [MY_SUITS_QUERY_KEY, userId, includeUniqueCodes ? 'with-codes' : 'public'] as const;
export const mySuitsCountQueryKey = (userId: string) => [MY_SUITS_COUNT_QUERY_KEY, userId] as const;

export async function fetchMySuits(
  userId: string,
  includeUniqueCodes = true,
): Promise<FursuitSummary[]> {
  const client = supabase as any;

  if (!includeUniqueCodes) {
    const { data, error } = await client.rpc('get_profile_fursuits', {
      p_profile_id: userId,
    });

    if (error) {
      throw new Error(`We couldn't load fursuits: ${error.message}`);
    }

    return mapFursuitRows(data ?? [], false);
  }

  const { data, error } = await client
    .from('fursuits')
    .select(
      `
      id,
      name,
      species_id,
      avatar_path,
      avatar_url,
      description,
      ${includeUniqueCodes ? 'unique_code,' : ''}
      visibility_audience,
      owner_attribution_visibility,
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
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`We couldn't load your suits: ${error.message}`);
  }

  return mapFursuitRows(data ?? [], includeUniqueCodes);
}

async function mapFursuitRows(rows: any[], includeUniqueCodes: boolean): Promise<FursuitSummary[]> {
  const makersByFursuitId = await fetchFursuitMakersByFursuitIds(rows.map((item: any) => item.id));

  return rows.map((item: any) => {
    const conventions = mapFursuitConventionAppearances(item.fursuit_conventions ?? []);

    const bio = applyProfileSocialLinksToBio(
      mapLatestFursuitBio(item.fursuit_bios ?? item.fursuit_bio ?? null),
      parseSocialLinks(item.owner_profile?.social_links ?? item.owner_social_links ?? null),
    );
    const speciesEntry = item.species_entry ?? null;
    const speciesName = speciesEntry?.name ?? null;
    const speciesId = speciesEntry?.id ?? item.species_id ?? null;
    const colors = mapFursuitColors(item.color_assignments ?? null);
    const makers = makersByFursuitId.get(item.id) ?? [];

    return {
      id: item.id,
      name: item.name,
      species: speciesName,
      speciesId: speciesId,
      colors,
      avatar_path: item.avatar_path ?? null,
      avatar_url: resolveStorageMediaUrl({
        bucket: FURSUIT_BUCKET,
        path: item.avatar_path ?? null,
        legacyUrl: item.avatar_url ?? null,
      }),
      description: item.description ?? null,
      unique_code: includeUniqueCodes ? (item.unique_code ?? null) : null,
      visibility_audience: normalizeVisibilityAudience(item.visibility_audience),
      ownerAttributionVisibility:
        item.owner_attribution_visibility === 'hidden' ? 'hidden' : 'public',
      catchCount: typeof item.catch_count === 'number' ? item.catch_count : 0,
      created_at: item.created_at ?? null,
      conventions,
      makers,
      bio,
    } satisfies FursuitSummary;
  });
}

export const createMySuitsQueryOptions = (userId: string) => ({
  queryKey: mySuitsQueryKey(userId),
  queryFn: () => fetchMySuits(userId),
  staleTime: MY_SUITS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

export async function fetchMySuitsCount(userId: string): Promise<number> {
  const client = supabase as any;
  const { count, error } = await client
    .from('fursuits')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId);

  if (error) {
    throw new Error(`We couldn't count your suits: ${error.message}`);
  }

  return count ?? 0;
}

export const createMySuitsCountQueryOptions = (userId: string) => ({
  queryKey: mySuitsCountQueryKey(userId),
  queryFn: () => fetchMySuitsCount(userId),
  staleTime: MY_SUITS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
