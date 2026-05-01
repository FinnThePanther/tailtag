import { supabase } from '../../../lib/supabase';
import { mapFursuitColors, mapLatestFursuitBio } from './utils';
import { fetchFursuitMakersByFursuitIds } from './makers';
import type { FursuitDetail } from '../types';
import type { CatchMode } from '../../catch-confirmations';
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
      catch_mode,
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
        convention:conventions (
          id,
          slug,
          name,
          location,
          start_date,
          end_date
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
    .map((entry: any) => entry?.convention)
    .filter(Boolean)
    .map((convention: any) => ({
      id: convention.id,
      slug: convention.slug,
      name: convention.name,
      location: convention.location ?? null,
      start_date: convention.start_date ?? null,
      end_date: convention.end_date ?? null,
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

  // Default to AUTO_ACCEPT if not set
  const catchMode: CatchMode =
    data.catch_mode === 'MANUAL_APPROVAL' ? 'MANUAL_APPROVAL' : 'AUTO_ACCEPT';

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
    catchMode,
    created_at: data.created_at ?? null,
    conventions,
    makers,
    bio,
  } satisfies FursuitDetail;
}
