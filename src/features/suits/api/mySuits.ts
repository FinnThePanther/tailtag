import { supabase } from '../../../lib/supabase';

export type FursuitSummary = {
  id: string;
  name: string;
  species: string | null;
  avatar_url: string | null;
  unique_code: string | null;
  created_at: string | null;
};

export const MY_SUITS_QUERY_KEY = 'my-suits';
export const MY_SUITS_STALE_TIME = 2 * 60_000;

export const mySuitsQueryKey = (userId: string) => [MY_SUITS_QUERY_KEY, userId] as const;

export async function fetchMySuits(userId: string): Promise<FursuitSummary[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('fursuits')
    .select('id, name, species, avatar_url, unique_code, created_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`We couldn't load your suits: ${error.message}`);
  }

  return data ?? [];
}

export const createMySuitsQueryOptions = (userId: string) => ({
  queryKey: mySuitsQueryKey(userId),
  queryFn: () => fetchMySuits(userId),
  staleTime: MY_SUITS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
