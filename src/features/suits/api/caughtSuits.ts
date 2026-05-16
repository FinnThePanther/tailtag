import { supabase } from '../../../lib/supabase';
import type { FursuitSummary } from '../types';
import { normalizeVisibilityAudience } from '@/features/adult-boundary';
import {
  applyProfileSocialLinksToBio,
  mapFursuitColors,
  mapLatestFursuitBio,
  parseSocialLinks,
} from './utils';
import { fetchFursuitMakersByFursuitIds } from './makers';
import { CATCH_PHOTO_BUCKET, FURSUIT_BUCKET } from '../../../constants/storage';
import { resolveStorageMediaUrl } from '../../../utils/supabase-image';

export type CaughtRecord = {
  id: string;
  caught_at: string | null;
  conventionId: string | null;
  convention: CaughtRecordConvention | null;
  catchNumber: number | null;
  catchPhotoPath?: string | null;
  catchPhotoUrl: string | null;
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

export async function fetchCaughtSuits(userId: string): Promise<CaughtRecord[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('catches')
    .select(
      `
      id,
      caught_at,
      convention_id,
      catch_number,
      catch_photo_path,
      catch_photo_url,
      convention:conventions (
        id,
        name,
        location,
        start_date,
        end_date,
        status
      ),
      fursuit:fursuits (
        id,
        owner_id,
        name,
        species_id,
        avatar_path,
        avatar_url,
        catch_count,
        is_tutorial,
        description,
        unique_code,
        visibility_audience,
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
      )
    `,
    )
    .eq('catcher_id', userId)
    .eq('status', 'ACCEPTED')
    .order('caught_at', { ascending: false });

  if (error) {
    throw new Error(`We couldn't load your catches: ${error.message}`);
  }

  const makersByFursuitId = await fetchFursuitMakersByFursuitIds(
    (data ?? []).map((record: any) => record.fursuit?.id).filter(Boolean),
  );

  return (data ?? [])
    .map((record: any) => {
      const rawFursuit = record.fursuit;

      if (rawFursuit?.is_tutorial) {
        return null;
      }

      const fursuit = rawFursuit
        ? ({
            id: rawFursuit.id,
            owner_id: rawFursuit.owner_id ?? null,
            name: rawFursuit.name,
            species: rawFursuit.species_entry?.name ?? null,
            speciesId: rawFursuit.species_entry?.id ?? rawFursuit.species_id ?? null,
            colors: mapFursuitColors(rawFursuit.color_assignments ?? null),
            avatar_path: rawFursuit.avatar_path ?? null,
            avatar_url: resolveStorageMediaUrl({
              bucket: FURSUIT_BUCKET,
              path: rawFursuit.avatar_path ?? null,
              legacyUrl: rawFursuit.avatar_url ?? null,
            }),
            description: rawFursuit.description ?? null,
            unique_code: rawFursuit.unique_code ?? null,
            visibility_audience: normalizeVisibilityAudience(rawFursuit.visibility_audience),
            catchCount: typeof rawFursuit.catch_count === 'number' ? rawFursuit.catch_count : 0,
            created_at: rawFursuit.created_at ?? null,
            conventions: [],
            makers: makersByFursuitId.get(rawFursuit.id) ?? [],
            bio: applyProfileSocialLinksToBio(
              mapLatestFursuitBio(rawFursuit.fursuit_bios ?? null),
              parseSocialLinks(rawFursuit.owner_profile?.social_links ?? null),
            ),
          } satisfies FursuitSummary)
        : null;

      return {
        id: record.id,
        caught_at: record.caught_at ?? null,
        conventionId: record.convention_id ?? null,
        convention: mapCaughtRecordConvention(record.convention ?? null),
        catchNumber: typeof record.catch_number === 'number' ? record.catch_number : null,
        catchPhotoPath: record.catch_photo_path ?? null,
        catchPhotoUrl: resolveStorageMediaUrl({
          bucket: CATCH_PHOTO_BUCKET,
          path: record.catch_photo_path ?? null,
          legacyUrl: record.catch_photo_url ?? null,
        }),
        fursuit,
      } satisfies CaughtRecord;
    })
    .filter((entry: CaughtRecord | null): entry is CaughtRecord => Boolean(entry));
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
