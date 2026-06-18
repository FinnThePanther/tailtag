import { supabase } from '../../lib/supabase';
import { captureHandledMessage } from '../../lib/sentry';

export type FursuitSpeciesOption = {
  id: string;
  name: string;
  normalizedName: string;
};

export const FURSUIT_SPECIES_QUERY_KEY = 'fursuit-species';
export const MAX_FURSUIT_SPECIES = 5;

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
  value.trim().replace(/\s+/g, ' ').toLowerCase();

export const dedupeSpeciesOptions = (options: FursuitSpeciesOption[]) => {
  const seen = new Set<string>();
  const deduped: FursuitSpeciesOption[] = [];

  for (const option of options) {
    const key = option.normalizedName || normalizeSpeciesName(option.name);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(option);
  }

  return deduped;
};

export const validateFursuitSpeciesSelection = (options: FursuitSpeciesOption[]) => {
  const deduped = dedupeSpeciesOptions(options);

  if (deduped.length === 0) {
    throw new Error('Add at least one fursuit species before saving.');
  }

  if (deduped.length > MAX_FURSUIT_SPECIES) {
    throw new Error(`You can choose up to ${MAX_FURSUIT_SPECIES} species.`);
  }

  return deduped;
};

export const formatFursuitSpeciesList = (
  species: FursuitSpeciesOption[],
  fallbackSpecies?: string | null,
) => {
  const names = dedupeSpeciesOptions(species)
    .map((option) => option.name.trim())
    .filter(Boolean);

  if (names.length > 0) {
    return names.join(' / ');
  }

  return fallbackSpecies?.trim() || null;
};

export async function ensureSpeciesEntries(names: string[]): Promise<FursuitSpeciesOption[]> {
  const records: FursuitSpeciesOption[] = [];

  for (const name of names) {
    records.push(await ensureSpeciesEntry(name));
  }

  return validateFursuitSpeciesSelection(records);
}

export async function replaceFursuitSpeciesAssignments(
  fursuitId: string,
  species: FursuitSpeciesOption[],
): Promise<FursuitSpeciesOption[]> {
  const deduped = validateFursuitSpeciesSelection(species);
  const client = supabase as any;

  const { error: clearError } = await client
    .from('fursuit_species_assignments')
    .delete()
    .eq('fursuit_id', fursuitId);

  if (clearError) {
    throw new Error(`Failed to clear species assignments: ${clearError.message}`);
  }

  const assignments = deduped.map((option, index) => ({
    fursuit_id: fursuitId,
    species_id: option.id,
    position: index + 1,
  }));

  const { error: insertError } = await client
    .from('fursuit_species_assignments')
    .insert(assignments);

  if (insertError) {
    throw new Error(`Failed to save species assignments: ${insertError.message}`);
  }

  return deduped;
}

export const upsertSpeciesOptionsInCache = (
  current: FursuitSpeciesOption[] = [],
  records: FursuitSpeciesOption[],
) => {
  const byId = new Map(current.map((option) => [option.id, option]));

  for (const record of records) {
    byId.set(record.id, record);
  }

  return sortSpeciesOptions([...byId.values()]);
};

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

  captureHandledMessage('Species insert returned no rows and no error', {
    scope: 'species.ensureSpeciesEntry',
    normalizedName,
  });
  throw new Error('Failed to save species');
}
