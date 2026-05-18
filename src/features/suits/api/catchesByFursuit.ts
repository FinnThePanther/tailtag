import { supabase } from '../../../lib/supabase';
import { CATCH_PHOTO_BUCKET } from '../../../constants/storage';
import { resolveStorageMediaUrl } from '../../../utils/supabase-image';
import type { Database } from '../../../types/database';

type FursuitCatchRpcRow = Database['public']['Functions']['get_fursuit_catches']['Returns'][number];

export type CatchOfFursuitItem = {
  id: string;
  caught_at: string | null;
  catch_photo_path?: string | null;
  catch_photo_url: string | null;
  isRedacted: boolean;
};

export const CATCHES_BY_FURSUIT_QUERY_KEY = 'catches-by-fursuit';
export const CATCHES_BY_FURSUIT_STALE_TIME = 2 * 60_000;

export const catchesByFursuitQueryKey = (fursuitId: string, userId?: string | null) =>
  [CATCHES_BY_FURSUIT_QUERY_KEY, fursuitId, userId ?? null] as const;

export async function fetchCatchesByFursuit(fursuitId: string): Promise<CatchOfFursuitItem[]> {
  const { data, error } = await supabase.rpc('get_fursuit_catches', {
    p_fursuit_id: fursuitId,
  });

  if (error) {
    throw new Error(`We couldn't load catches for this fursuit: ${error.message}`);
  }

  return (data ?? []).map((row: FursuitCatchRpcRow) => ({
    id: row.catch_id,
    caught_at: row.caught_at ?? null,
    catch_photo_path: row.is_redacted === true ? null : (row.catch_photo_path ?? null),
    catch_photo_url:
      row.is_redacted === true
        ? null
        : resolveStorageMediaUrl({
            bucket: CATCH_PHOTO_BUCKET,
            path: row.catch_photo_path ?? null,
            legacyUrl: row.catch_photo_url ?? null,
          }),
    isRedacted: row.is_redacted === true,
  }));
}

export const createCatchesByFursuitQueryOptions = (fursuitId: string, userId?: string | null) => ({
  queryKey: catchesByFursuitQueryKey(fursuitId, userId),
  queryFn: () => fetchCatchesByFursuit(fursuitId),
  staleTime: CATCHES_BY_FURSUIT_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
