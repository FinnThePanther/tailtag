import { supabase } from '../../lib/supabase';

export type FursuitSpeciesOption = {
  id: string;
  name: string;
  normalizedName: string;
};

export const FURSUIT_SPECIES_QUERY_KEY = 'fursuit-species';

const SPECIES_FIELDS = 'id, name, normalized_name';

const mapSpeciesRecord = (input: any): FursuitSpeciesOption => ({
  id: input.id,
  name: input.name,
  normalizedName: input.normalized_name,
});

const compareSpeciesOptions = (a: FursuitSpeciesOption, b: FursuitSpeciesOption) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export const sortSpeciesOptions = (options: FursuitSpeciesOption[]) =>
  [...options].sort(compareSpeciesOptions);

export const normalizeSpeciesName = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

export async function fetchFursuitSpecies(): Promise<FursuitSpeciesOption[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('fursuit_species')
    .select(SPECIES_FIELDS)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to load fursuit species: ${error.message}`);
  }

  return sortSpeciesOptions((data ?? []).map(mapSpeciesRecord));
}

export async function ensureSpeciesEntry(name: string): Promise<FursuitSpeciesOption> {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error('Species name is required');
  }

  const normalizedName = normalizeSpeciesName(trimmedName);
  const client = supabase as any;

  const { data: existing, error: lookupError } = await client
    .from('fursuit_species')
    .select(SPECIES_FIELDS)
    .eq('normalized_name', normalizedName)
    .maybeSingle();

  if (lookupError && lookupError.code !== 'PGRST116') {
    throw new Error(`Failed to look up species: ${lookupError.message}`);
  }

  if (existing) {
    return mapSpeciesRecord(existing);
  }

  const { data: created, error: insertError } = await client
    .from('fursuit_species')
    .insert({ name: trimmedName })
    .select(SPECIES_FIELDS)
    .single();

  if (!insertError && created) {
    return mapSpeciesRecord(created);
  }

  if (insertError?.code === '23505') {
    const { data: retry, error: retryError } = await client
      .from('fursuit_species')
      .select(SPECIES_FIELDS)
      .eq('normalized_name', normalizedName)
      .maybeSingle();

    if (retryError) {
      throw new Error(`Failed to finish species lookup: ${retryError.message}`);
    }

    if (retry) {
      return mapSpeciesRecord(retry);
    }
  }

  if (insertError) {
    throw new Error(`Failed to save species: ${insertError.message}`);
  }

  throw new Error('Failed to save species');
}
