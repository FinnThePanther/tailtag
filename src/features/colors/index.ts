import { supabase } from '../../lib/supabase';

export type FursuitColorOption = {
  id: string;
  name: string;
  normalizedName: string;
};

export const FURSUIT_COLORS_QUERY_KEY = 'fursuit-colors';
export const MAX_FURSUIT_COLORS = 3;

const COLOR_FIELDS = 'id, name, normalized_name, is_active';

const mapColorRecord = (input: any): FursuitColorOption => ({
  id: input.id,
  name: input.name,
  normalizedName: input.normalized_name,
});

const compareColorOptions = (a: FursuitColorOption, b: FursuitColorOption) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export const sortColorOptions = (options: FursuitColorOption[]) =>
  [...options].sort(compareColorOptions);

export const normalizeColorName = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

export async function fetchFursuitColors(): Promise<FursuitColorOption[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('fursuit_colors')
    .select(COLOR_FIELDS)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to load fursuit colors: ${error.message}`);
  }

  return sortColorOptions((data ?? []).map(mapColorRecord));
}
