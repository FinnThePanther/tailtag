import { supabase } from '../../../lib/supabase';
import type { FursuitSummary } from '../types';
import { mapFursuitColors, mapLatestFursuitBio } from './utils';
import { fetchFursuitMakersByFursuitIds } from './makers';
import { CATCH_PHOTO_BUCKET, FURSUIT_BUCKET } from '../../../constants/storage';
import { resolveStorageMediaUrl } from '../../../utils/supabase-image';

export type CaughtRecord = {
  id: string;
  caught_at: string | null;
  catchNumber: number | null;
  catchPhotoPath?: string | null;
  catchPhotoUrl: string | null;
  fursuit: FursuitSummary | null;
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
      catch_number,
      catch_photo_path,
      catch_photo_url,
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
          pronouns,
          likes_and_interests,
          ask_me_about,
          social_links,
          created_at,
          updated_at
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
            catchCount: typeof rawFursuit.catch_count === 'number' ? rawFursuit.catch_count : 0,
            created_at: rawFursuit.created_at ?? null,
            conventions: [],
            makers: makersByFursuitId.get(rawFursuit.id) ?? [],
            bio: mapLatestFursuitBio(rawFursuit.fursuit_bios ?? null),
          } satisfies FursuitSummary)
        : null;

      return {
        id: record.id,
        caught_at: record.caught_at ?? null,
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

export const createCaughtSuitsQueryOptions = (userId: string) => ({
  queryKey: caughtSuitsQueryKey(userId),
  queryFn: () => fetchCaughtSuits(userId),
  staleTime: CAUGHT_SUITS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
