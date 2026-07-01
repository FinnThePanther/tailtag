import { supabase } from '../../lib/supabase';

export type FursuitColorOption = {
  id: string;
  name: string;
  normalizedName: string;
};

export const FURSUIT_COLORS_QUERY_KEY = 'fursuit-colors';
export const MAX_FURSUIT_COLORS = 5;
export const MAX_FURSUIT_COLOR_DETAILS_LENGTH = 200;
export const OTHER_FURSUIT_COLOR_NORMALIZED_NAME = 'other';

const COLOR_FIELDS = 'id, name, normalized_name, is_active';

const mapColorRecord = (input: any): FursuitColorOption => ({
  id: input.id,
  name: input.name,
  normalizedName: input.normalized_name,
});

const compareColorOptions = (a: FursuitColorOption, b: FursuitColorOption) => {
  const aIsOther = a.normalizedName === OTHER_FURSUIT_COLOR_NORMALIZED_NAME;
  const bIsOther = b.normalizedName === OTHER_FURSUIT_COLOR_NORMALIZED_NAME;

  if (aIsOther !== bIsOther) {
    return aIsOther ? 1 : -1;
  }

  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
};

export const sortColorOptions = (options: FursuitColorOption[]) =>
  [...options].sort(compareColorOptions);

export const normalizeColorName = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

export const normalizeFursuitColorDetails = (value: string | null | undefined) => {
  const normalized = (value ?? '').trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
};

export const selectedColorsIncludeOther = (colors: FursuitColorOption[]) =>
  colors.some((color) => color.normalizedName === OTHER_FURSUIT_COLOR_NORMALIZED_NAME);

export const selectedColorIdsIncludeOther = (
  colorIds: string[],
  colorOptions: FursuitColorOption[],
) => {
  const otherColorIds = new Set(
    colorOptions
      .filter((color) => color.normalizedName === OTHER_FURSUIT_COLOR_NORMALIZED_NAME)
      .map((color) => color.id),
  );
  return colorIds.some((colorId) => otherColorIds.has(colorId));
};

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
