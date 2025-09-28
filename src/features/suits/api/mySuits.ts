import { supabase } from '../../../lib/supabase';
import type { ConventionSummary } from '../../conventions';

export type FursuitSummary = {
  id: string;
  name: string;
  species: string | null;
  avatar_url: string | null;
  unique_code: string | null;
  created_at: string | null;
  conventions: ConventionSummary[];
};

export const MY_SUITS_QUERY_KEY = 'my-suits';
export const MY_SUITS_STALE_TIME = 2 * 60_000;

export const mySuitsQueryKey = (userId: string) => [MY_SUITS_QUERY_KEY, userId] as const;

export async function fetchMySuits(userId: string): Promise<FursuitSummary[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('fursuits')
    .select(
      `
      id,
      name,
      species,
      avatar_url,
      unique_code,
      created_at,
      fursuit_conventions:fursuit_conventions (
        convention:conventions (
          id,
          slug,
          name,
          location,
          start_date,
          end_date
        )
      )
    `
    )
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`We couldn't load your suits: ${error.message}`);
  }

  return (data ?? []).map((item: any) => {
    const conventions: ConventionSummary[] = (item.fursuit_conventions ?? [])
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

    return {
      id: item.id,
      name: item.name,
      species: item.species ?? null,
      avatar_url: item.avatar_url ?? null,
      unique_code: item.unique_code ?? null,
      created_at: item.created_at ?? null,
      conventions,
    } satisfies FursuitSummary;
  });
}

export const createMySuitsQueryOptions = (userId: string) => ({
  queryKey: mySuitsQueryKey(userId),
  queryFn: () => fetchMySuits(userId),
  staleTime: MY_SUITS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
