import { supabase } from '@/lib/supabase';
import { captureHandledMessage, captureSupabaseError } from '@/lib/sentry';

export type FursuitSpeciesOption = {
  id: string;
  name: string;
  normalizedName: string;
};

export type FursuitSpeciesSuggestion = {
  key: string;
  name: string;
  normalizedName: string;
  option: FursuitSpeciesOption | null;
  source: 'common' | 'typed';
};

export const FURSUIT_SPECIES_QUERY_KEY = 'fursuit-species';
export const MAX_FURSUIT_SPECIES = 5;
export const DEFAULT_FURSUIT_SPECIES_SUGGESTION_LIMIT = 12;

export const COMMON_FURSONA_SPECIES = [
  'Wolf',
  'Fox',
  'Dragon',
  'Dog',
  'Cat',
  'Tiger',
  'Husky',
  'Lion',
  'Hyena',
  'Deer',
  'Rabbit',
  'Protogen',
  'Dutch Angel Dragon',
  'Sergal',
  'Avali',
  'Coyote',
  'Snow Leopard',
  'Red Panda',
  'Raccoon',
  'Otter',
  'Bear',
  'Skunk',
  'Horse',
  'Manokit',
] as const;

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

const normalizeDisplaySpeciesName = (value: string) => value.trim().replace(/\s+/g, ' ');

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

export const buildFursuitSpeciesSuggestions = ({
  speciesOptions,
  selectedSpecies,
  input,
  limit = DEFAULT_FURSUIT_SPECIES_SUGGESTION_LIMIT,
}: {
  speciesOptions: FursuitSpeciesOption[];
  selectedSpecies: FursuitSpeciesOption[];
  input: string;
  limit?: number;
}): FursuitSpeciesSuggestion[] => {
  const normalizedInput = normalizeSpeciesName(input);
  const typedName = normalizeDisplaySpeciesName(input);
  const optionsByName = new Map<string, FursuitSpeciesOption>();
  const selectedNames = new Set(
    selectedSpecies.map((option) => option.normalizedName || normalizeSpeciesName(option.name)),
  );

  speciesOptions.forEach((option) => {
    const normalizedName = option.normalizedName || normalizeSpeciesName(option.name);
    if (!optionsByName.has(normalizedName)) {
      optionsByName.set(normalizedName, option);
    }
  });

  const commonSuggestions = COMMON_FURSONA_SPECIES.flatMap((name) => {
    const normalizedName = normalizeSpeciesName(name);

    if (selectedNames.has(normalizedName)) {
      return [];
    }

    if (normalizedInput && !normalizedName.includes(normalizedInput)) {
      return [];
    }

    const option = optionsByName.get(normalizedName) ?? null;
    return [
      {
        key: `common:${normalizedName}`,
        name: option?.name ?? name,
        normalizedName,
        option,
        source: 'common' as const,
      },
    ];
  });

  if (normalizedInput && commonSuggestions.length === 0 && !selectedNames.has(normalizedInput)) {
    const option = optionsByName.get(normalizedInput) ?? null;
    return [
      {
        key: `typed:${normalizedInput}`,
        name: option?.name ?? typedName,
        normalizedName: option?.normalizedName ?? normalizedInput,
        option,
        source: 'typed',
      },
    ];
  }

  return commonSuggestions.slice(0, limit);
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

  const { error } = await client.rpc('replace_fursuit_species_assignments', {
    p_fursuit_id: fursuitId,
    p_species_ids: deduped.map((option) => option.id),
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'species.replaceFursuitSpeciesAssignments',
      fursuitId,
      speciesIds: deduped.map((option) => option.id),
    });
    throw new Error(`Failed to save species assignments: ${error.message}`);
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
