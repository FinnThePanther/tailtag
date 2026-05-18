import { supabase } from '../../../lib/supabase';
import { mapCaughtRecordFromRpcRow, type CaughtRecord } from './caughtSuits';

export const CATCH_BY_ID_QUERY_KEY = 'catch-by-id';
export const CATCH_BY_ID_STALE_TIME = 2 * 60_000;

export const catchByIdQueryKey = (catchId: string, userId?: string | null) =>
  userId
    ? ([CATCH_BY_ID_QUERY_KEY, catchId, userId] as const)
    : ([CATCH_BY_ID_QUERY_KEY, catchId] as const);

export async function fetchCatchById(catchId: string): Promise<CaughtRecord | null> {
  const client = supabase as any;
  const { data, error } = await client.rpc('get_catch_detail', {
    p_catch_id: catchId,
  });

  if (error) {
    throw new Error(`We couldn't load that catch: ${error.message}`);
  }

  const record = Array.isArray(data) ? data[0] : null;

  if (!record) {
    return null;
  }

  return mapCaughtRecordFromRpcRow(record);
}

export const createCatchByIdQueryOptions = (catchId: string, userId?: string | null) => ({
  queryKey: catchByIdQueryKey(catchId, userId),
  queryFn: () => fetchCatchById(catchId),
  staleTime: CATCH_BY_ID_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
