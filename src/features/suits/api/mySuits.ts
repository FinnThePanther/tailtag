import { supabase } from '../../../lib/supabase';
import type { Database, FursuitsRow, Json } from '@/types/database';
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
import { captureSupabaseError } from '@/lib/sentry';

type ProfileFursuitsRpcRow =
  Database['public']['Functions']['get_profile_fursuits']['Returns'][number];
type FursuitSpeciesRow = Pick<
  Database['public']['Tables']['fursuit_species']['Row'],
  'id' | 'name' | 'normalized_name'
>;
type FursuitColorRow = Pick<
  Database['public']['Tables']['fursuit_colors']['Row'],
  'id' | 'name' | 'normalized_name'
>;
type ConventionRow = Pick<
  Database['public']['Tables']['conventions']['Row'],
  | 'id'
  | 'slug'
  | 'name'
  | 'location'
  | 'start_date'
  | 'end_date'
  | 'timezone'
  | 'status'
  | 'finalizing_started_at'
  | 'closeout_not_before'
  | 'latitude'
  | 'longitude'
  | 'geofence_radius_meters'
  | 'geofence_enabled'
  | 'location_verification_required'
>;
type FursuitBioRow = Pick<
  Database['public']['Tables']['fursuit_bios']['Row'],
  | 'version'
  | 'owner_name'
  | 'photo_credit'
  | 'pronouns'
  | 'likes_and_interests'
  | 'ask_me_about'
  | 'social_links'
  | 'created_at'
  | 'updated_at'
>;
type TableFursuitRow = Pick<
  FursuitsRow,
  | 'id'
  | 'name'
  | 'species_id'
  | 'avatar_path'
  | 'avatar_url'
  | 'description'
  | 'unique_code'
  | 'visibility_audience'
  | 'owner_attribution_visibility'
  | 'catch_count'
  | 'created_at'
> & {
  species_entry: FursuitSpeciesRow | null;
  color_assignments:
    | {
        position: number;
        color: FursuitColorRow | null;
      }[]
    | null;
  fursuit_conventions:
    | {
        roster_visible: boolean;
        roster_state: string;
        active_until: string | null;
        convention: ConventionRow | null;
      }[]
    | null;
  fursuit_bios: FursuitBioRow[] | null;
  owner_profile: { social_links: Json | null } | null;
};

const isSpeciesEntry = (value: unknown): value is Pick<FursuitSpeciesRow, 'id' | 'name'> =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'string' &&
  'name' in value &&
  typeof value.name === 'string';

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
      captureSupabaseError(error, {
        scope: 'suits.fetchMySuits.getProfileFursuits',
        userId,
      });
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

async function mapFursuitRows(
  rows: ProfileFursuitsRpcRow[] | TableFursuitRow[],
  includeUniqueCodes: boolean,
): Promise<FursuitSummary[]> {
  const makersByFursuitId = await fetchFursuitMakersByFursuitIds(rows.map((item) => item.id));

  return rows.map((item) => {
    const conventions = mapFursuitConventionAppearances(item.fursuit_conventions ?? []);
    const fursuitBio = 'fursuit_bios' in item ? item.fursuit_bios : item.fursuit_bio;
    const ownerSocialLinks =
      'owner_profile' in item ? item.owner_profile?.social_links : item.owner_social_links;
    const uniqueCode = 'unique_code' in item ? item.unique_code : null;

    const bio = applyProfileSocialLinksToBio(
      mapLatestFursuitBio(fursuitBio ?? null),
      parseSocialLinks(ownerSocialLinks ?? null),
    );
    const speciesEntry = isSpeciesEntry(item.species_entry) ? item.species_entry : null;
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
      unique_code: includeUniqueCodes ? (uniqueCode ?? null) : null,
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
