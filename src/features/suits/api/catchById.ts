import { supabase } from '../../../lib/supabase';
import type { FursuitSummary } from '../types';
import type { CatchMode } from '../../catch-confirmations';
import { mapFursuitColors, mapLatestFursuitBio } from './utils';
import type { CaughtRecord } from './caughtSuits';

export const CATCH_BY_ID_QUERY_KEY = 'catch-by-id';
export const CATCH_BY_ID_STALE_TIME = 2 * 60_000;

export const catchByIdQueryKey = (catchId: string) =>
  [CATCH_BY_ID_QUERY_KEY, catchId] as const;

const CATCH_SELECT = `
  id,
  caught_at,
  catch_number,
  catch_photo_url,
  fursuit:fursuits (
    id,
    name,
    species_id,
    avatar_url,
    catch_count,
    catch_mode,
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
`;

export async function fetchCatchById(catchId: string): Promise<CaughtRecord | null> {
  const client = supabase as any;
  const { data: record, error } = await client
    .from('catches')
    .select(CATCH_SELECT)
    .eq('id', catchId)
    .eq('status', 'ACCEPTED')
    .maybeSingle();

  if (error) {
    throw new Error(`We couldn't load that catch: ${error.message}`);
  }

  if (!record) {
    return null;
  }

  const rawFursuit = record.fursuit;

  if (rawFursuit?.is_tutorial) {
    return null;
  }

  const catchMode: CatchMode =
    rawFursuit?.catch_mode === 'MANUAL_APPROVAL' ? 'MANUAL_APPROVAL' : 'AUTO_ACCEPT';

  const fursuit: FursuitSummary | null = rawFursuit
    ? {
        id: rawFursuit.id,
        name: rawFursuit.name,
        species: rawFursuit.species_entry?.name ?? null,
        speciesId: rawFursuit.species_entry?.id ?? rawFursuit.species_id ?? null,
        colors: mapFursuitColors(rawFursuit.color_assignments ?? null),
        avatar_url: rawFursuit.avatar_url ?? null,
        description: rawFursuit.description ?? null,
        unique_code: rawFursuit.unique_code ?? null,
        catchCount:
          typeof rawFursuit.catch_count === 'number' ? rawFursuit.catch_count : 0,
        catchMode,
        created_at: rawFursuit.created_at ?? null,
        conventions: [],
        bio: mapLatestFursuitBio(rawFursuit.fursuit_bios ?? null),
      }
    : null;

  return {
    id: record.id,
    caught_at: record.caught_at ?? null,
    catchNumber:
      typeof record.catch_number === 'number' ? record.catch_number : null,
    catchPhotoUrl: record.catch_photo_url ?? null,
    fursuit,
  } satisfies CaughtRecord;
}

export const createCatchByIdQueryOptions = (catchId: string) => ({
  queryKey: catchByIdQueryKey(catchId),
  queryFn: () => fetchCatchById(catchId),
  staleTime: CATCH_BY_ID_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
