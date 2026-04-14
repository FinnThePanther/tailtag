import { supabase } from '../../../lib/supabase';
import { CATCH_PHOTO_BUCKET } from '../../../constants/storage';
import { resolveStorageMediaUrl } from '../../../utils/supabase-image';

export type CatchOfFursuitItem = {
  id: string;
  caught_at: string | null;
  catch_photo_path?: string | null;
  catch_photo_url: string | null;
};

export const CATCHES_BY_FURSUIT_QUERY_KEY = 'catches-by-fursuit';
export const CATCHES_BY_FURSUIT_STALE_TIME = 2 * 60_000;

export const catchesByFursuitQueryKey = (fursuitId: string) =>
  [CATCHES_BY_FURSUIT_QUERY_KEY, fursuitId] as const;

export async function fetchCatchesByFursuit(fursuitId: string): Promise<CatchOfFursuitItem[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('catches')
    .select('id, caught_at, catch_photo_path, catch_photo_url')
    .eq('fursuit_id', fursuitId)
    .eq('status', 'ACCEPTED')
    .order('caught_at', { ascending: false });

  if (error) {
    throw new Error(`We couldn't load catches for this fursuit: ${error.message}`);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    caught_at: row.caught_at ?? null,
    catch_photo_path: row.catch_photo_path ?? null,
    catch_photo_url: resolveStorageMediaUrl({
      bucket: CATCH_PHOTO_BUCKET,
      path: row.catch_photo_path ?? null,
      legacyUrl: row.catch_photo_url ?? null,
    }),
  }));
}

export const createCatchesByFursuitQueryOptions = (fursuitId: string) => ({
  queryKey: catchesByFursuitQueryKey(fursuitId),
  queryFn: () => fetchCatchesByFursuit(fursuitId),
  staleTime: CATCHES_BY_FURSUIT_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
