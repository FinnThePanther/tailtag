import { supabase } from '../../../lib/supabase';
import type { FursuitSummary } from '../types';
import type { CatchMode } from '../../catch-confirmations';
import { mapFursuitColors, mapLatestFursuitBio } from './utils';
import { captureSupabaseError } from '../../../lib/sentry';

export type CaughtRecord = {
  id: string;
  caught_at: string | null;
  catchNumber: number | null;
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
          tagline,
          fun_fact,
          likes_and_interests,
          ask_me_about,
          social_links,
          created_at,
          updated_at
        )
      )
    `
    )
    .eq('catcher_id', userId)
    .eq('status', 'ACCEPTED')
    .order('caught_at', { ascending: false });

  if (error) {
    captureSupabaseError(error, {
      scope: 'suits.fetchCaughtSuits',
      action: 'select',
      userId,
    });
    throw new Error(`We couldn't load your catches: ${error.message}`);
  }

  return (data ?? [])
    .map((record: any) => {
      const rawFursuit = record.fursuit;

      if (rawFursuit?.is_tutorial) {
        return null;
      }

      // Default to AUTO_ACCEPT if not set
      const catchMode: CatchMode = rawFursuit?.catch_mode === 'MANUAL_APPROVAL' ? 'MANUAL_APPROVAL' : 'AUTO_ACCEPT';

      const fursuit = rawFursuit
        ? ({
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
          } satisfies FursuitSummary)
        : null;

      return {
        id: record.id,
        caught_at: record.caught_at ?? null,
        catchNumber:
          typeof record.catch_number === 'number' ? record.catch_number : null,
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
