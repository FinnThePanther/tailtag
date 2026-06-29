import { supabase } from '../../../lib/supabase';
import type { Database, FursuitsRow, Json } from '@/types/database';
import type { FursuitSummary } from '../types';
import {
  applyProfileSocialLinksToBio,
  mapFursuitConventionAppearances,
  mapFursuitColors,
  mapFursuitSpecies,
  mapLatestFursuitBio,
  parseSocialLinks,
} from './utils';
import { formatFursuitSpeciesList } from '@/features/species';
import { fetchFursuitMakersByFursuitIds } from './makers';
import { FURSUIT_BUCKET } from '../../../constants/storage';
import { resolveStorageMediaUrl } from '../../../utils/supabase-image';
import { normalizeVisibilityAudience } from '@/features/adult-boundary';
import { captureSupabaseError } from '@/lib/sentry';
import {
  normalizeInteractionBadges,
  normalizeSocialSignal,
} from '@/features/interaction-preferences';

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
  | 'social_signal'
  | 'interaction_badges'
  | 'catch_count'
  | 'created_at'
> & {
  display_order?: number | null;
  species_entry: FursuitSpeciesRow | null;
  species_assignments:
    | {
        position: number;
        species: FursuitSpeciesRow | null;
      }[]
    | null;
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

const getDisplayOrder = (item: ProfileFursuitsRpcRow | TableFursuitRow) =>
  'display_order' in item && typeof item.display_order === 'number' ? item.display_order : null;

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
      social_signal,
      interaction_badges,
      catch_count,
      created_at,
      display_order,
      species_entry:fursuit_species (
        id,
        name,
        normalized_name
      ),
      species_assignments:fursuit_species_assignments (
        position,
        species:fursuit_species (
          id,
          name,
          normalized_name
        )
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
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) {
    captureSupabaseError(error, {
      scope: 'suits.fetchMySuits.orderedFursuits',
      userId,
      includeUniqueCodes,
      sortingPath: 'display_order_created_at_id',
    });
    throw new Error(`We couldn't load your suits: ${error.message}`);
  }

  return mapFursuitRows(data ?? [], includeUniqueCodes);
}

async function mapFursuitRows(
  rows: ProfileFursuitsRpcRow[] | TableFursuitRow[],
  includeUniqueCodes: boolean,
): Promise<FursuitSummary[]> {
  const fursuitIds = rows.map((item) => item.id);
  const assignmentFallbackFursuitIds = rows
    .filter((item) => !('species_assignments' in item))
    .map((item) => item.id);
  const [makersByFursuitId, speciesAssignmentsByFursuitId] = await Promise.all([
    fetchFursuitMakersByFursuitIds(fursuitIds),
    fetchSpeciesAssignmentsByFursuitIds(assignmentFallbackFursuitIds),
  ]);

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
    const rawSpeciesAssignments =
      'species_assignments' in item
        ? item.species_assignments
        : (speciesAssignmentsByFursuitId.get(item.id) ?? []);
    const speciesTags = mapFursuitSpecies(rawSpeciesAssignments ?? null, {
      id: speciesEntry?.id ?? item.species_id ?? null,
      name: speciesEntry?.name ?? null,
    });
    const primarySpecies = speciesTags[0] ?? null;
    const speciesName = formatFursuitSpeciesList(speciesTags, speciesEntry?.name ?? null);
    const speciesId = primarySpecies?.id ?? speciesEntry?.id ?? item.species_id ?? null;
    const colors = mapFursuitColors(item.color_assignments ?? null);
    const makers = makersByFursuitId.get(item.id) ?? [];

    return {
      id: item.id,
      name: item.name,
      species: speciesName,
      speciesId: speciesId,
      speciesTags,
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
      socialSignal: normalizeSocialSignal(item.social_signal),
      interactionBadges: normalizeInteractionBadges(item.interaction_badges),
      catchCount: typeof item.catch_count === 'number' ? item.catch_count : 0,
      created_at: item.created_at ?? null,
      display_order: getDisplayOrder(item),
      conventions,
      makers,
      bio,
    } satisfies FursuitSummary;
  });
}

async function fetchSpeciesAssignmentsByFursuitIds(fursuitIds: string[]) {
  const result = new Map<
    string,
    {
      position: number;
      species: FursuitSpeciesRow | null;
    }[]
  >();

  if (fursuitIds.length === 0) {
    return result;
  }

  const { data, error } = await (supabase as any)
    .from('fursuit_species_assignments')
    .select(
      `
      fursuit_id,
      position,
      species:fursuit_species (
        id,
        name,
        normalized_name
      )
    `,
    )
    .in('fursuit_id', fursuitIds)
    .order('position', { ascending: true });

  if (error) {
    captureSupabaseError(error, {
      scope: 'suits.fetchSpeciesAssignmentsByFursuitIds',
      fursuitIds,
    });
    return result;
  }

  for (const row of data ?? []) {
    const fursuitId = typeof row.fursuit_id === 'string' ? row.fursuit_id : null;
    if (!fursuitId) continue;

    const current = result.get(fursuitId) ?? [];
    current.push({
      position: Number(row.position),
      species: Array.isArray(row.species) ? (row.species[0] ?? null) : (row.species ?? null),
    });
    result.set(fursuitId, current);
  }

  return result;
}

export const createMySuitsQueryOptions = (userId: string) => ({
  queryKey: mySuitsQueryKey(userId),
  queryFn: () => fetchMySuits(userId),
  staleTime: MY_SUITS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

export async function reorderMySuits(fursuitIds: string[]): Promise<void> {
  const { error } = await (supabase as any).rpc('reorder_own_fursuits', {
    p_fursuit_ids: fursuitIds,
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'suits.reorderMySuits',
      fursuitIds,
    });
    throw new Error("We couldn't save your fursuit order. Please try again.");
  }
}

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
