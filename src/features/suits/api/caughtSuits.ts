import { supabase } from '../../../lib/supabase';
import type { FursuitSummary } from '../types';
import { normalizeVisibilityAudience } from '@/features/adult-boundary';
import {
  applyProfileSocialLinksToBio,
  mapFursuitColors,
  mapFursuitMakers,
  mapLatestFursuitBio,
  parseSocialLinks,
} from './utils';
import { CATCH_PHOTO_BUCKET, FURSUIT_BUCKET } from '../../../constants/storage';
import { resolveStorageMediaUrl } from '../../../utils/supabase-image';
import type { Database } from '../../../types/database';
import { normalizeSpeciesName, type FursuitSpeciesOption } from '@/features/species';
import {
  normalizeInteractionBadges,
  normalizeSocialSignal,
} from '@/features/interaction-preferences';

type CaughtSuitRpcRow = Database['public']['Functions']['get_my_caught_suits']['Returns'][number];
type CatchDetailRpcRow = Database['public']['Functions']['get_catch_detail']['Returns'][number];
type HistoricalCatchRpcRow = CaughtSuitRpcRow | CatchDetailRpcRow;

export type CaughtRecord = {
  id: string;
  caught_at: string | null;
  conventionId: string | null;
  convention: CaughtRecordConvention | null;
  catchNumber: number | null;
  catchPhotoPath?: string | null;
  catchPhotoUrl: string | null;
  fursuitRedacted: boolean;
  fursuit: FursuitSummary | null;
};

export type CaughtRecordConvention = {
  id: string;
  name: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
};

export const CAUGHT_SUITS_QUERY_KEY = 'caught-suits';
export const CAUGHT_SUITS_STALE_TIME = 2 * 60_000;

export const caughtSuitsQueryKey = (userId: string) => [CAUGHT_SUITS_QUERY_KEY, userId] as const;

export async function fetchCaughtSuits(_userId: string): Promise<CaughtRecord[]> {
  const { data, error } = await supabase.rpc('get_my_caught_suits');

  if (error) {
    throw new Error(`We couldn't load your catches: ${error.message}`);
  }

  return (data ?? []).map(mapCaughtRecordFromRpcRow);
}

export function mapCaughtRecordFromRpcRow(record: HistoricalCatchRpcRow): CaughtRecord {
  const fursuitId = typeof record.fursuit_id === 'string' ? record.fursuit_id : '';
  const fursuitRedacted = record.fursuit_redacted === true;
  const legacySpecies =
    !fursuitRedacted && record.species_id && record.species_name
      ? ([
          {
            id: record.species_id,
            name: record.species_name,
            normalizedName: normalizeSpeciesName(record.species_name),
          },
        ] satisfies FursuitSpeciesOption[])
      : [];
  const ownerAttributionVisibility =
    (record as any).fursuit_owner_attribution_visibility === 'hidden' ? 'hidden' : 'public';
  const hideSocialLinks = ownerAttributionVisibility === 'hidden';
  const fursuit = fursuitId
    ? ({
        id: fursuitId,
        isRedacted: fursuitRedacted,
        owner_id: fursuitRedacted ? null : (record.fursuit_owner_id ?? null),
        name: fursuitRedacted ? 'Unavailable fursuit' : (record.fursuit_name ?? 'Unknown'),
        species: fursuitRedacted ? null : (record.species_name ?? null),
        speciesId: fursuitRedacted ? null : (record.species_id ?? null),
        speciesTags: legacySpecies,
        colors: fursuitRedacted ? [] : mapFursuitColors(record.color_assignments ?? null),
        avatar_path: fursuitRedacted ? null : (record.fursuit_avatar_path ?? null),
        avatar_url: fursuitRedacted
          ? null
          : resolveStorageMediaUrl({
              bucket: FURSUIT_BUCKET,
              path: record.fursuit_avatar_path ?? null,
              legacyUrl: record.fursuit_avatar_url ?? null,
            }),
        description: fursuitRedacted ? null : (record.fursuit_description ?? null),
        unique_code: fursuitRedacted ? null : (record.fursuit_unique_code ?? null),
        visibility_audience: normalizeVisibilityAudience(record.fursuit_visibility_audience),
        ownerAttributionVisibility,
        socialSignal: fursuitRedacted
          ? null
          : normalizeSocialSignal((record as any).fursuit_social_signal),
        interactionBadges: fursuitRedacted
          ? []
          : normalizeInteractionBadges((record as any).fursuit_interaction_badges),
        catchCount:
          !fursuitRedacted && typeof record.fursuit_catch_count === 'number'
            ? record.fursuit_catch_count
            : 0,
        created_at: fursuitRedacted ? null : (record.fursuit_created_at ?? null),
        conventions: [],
        makers: fursuitRedacted ? [] : mapFursuitMakers(record.makers ?? null),
        bio: fursuitRedacted
          ? null
          : applyProfileSocialLinksToBio(
              mapLatestFursuitBio(record.fursuit_bio ?? null),
              hideSocialLinks ? [] : parseSocialLinks(record.owner_social_links ?? null),
              { hideSocialLinks },
            ),
      } satisfies FursuitSummary)
    : null;

  return {
    id: record.catch_id,
    caught_at: record.caught_at ?? null,
    conventionId: record.convention_id ?? null,
    convention: mapCaughtRecordConvention(record.convention ?? null),
    catchNumber: typeof record.catch_number === 'number' ? record.catch_number : null,
    catchPhotoPath: record.catch_photo_path ?? null,
    catchPhotoUrl: fursuitRedacted
      ? null
      : resolveStorageMediaUrl({
          bucket: CATCH_PHOTO_BUCKET,
          path: record.catch_photo_path ?? null,
          legacyUrl: record.catch_photo_url ?? null,
        }),
    fursuitRedacted,
    fursuit,
  } satisfies CaughtRecord;
}

export function mapCaughtRecordConvention(rawConvention: any): CaughtRecordConvention | null {
  if (!rawConvention?.id || !rawConvention?.name || !rawConvention?.status) {
    return null;
  }

  return {
    id: rawConvention.id,
    name: rawConvention.name,
    location: rawConvention.location ?? null,
    startDate: rawConvention.start_date ?? null,
    endDate: rawConvention.end_date ?? null,
    status: rawConvention.status,
  };
}

export const createCaughtSuitsQueryOptions = (userId: string) => ({
  queryKey: caughtSuitsQueryKey(userId),
  queryFn: () => fetchCaughtSuits(userId),
  staleTime: CAUGHT_SUITS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
