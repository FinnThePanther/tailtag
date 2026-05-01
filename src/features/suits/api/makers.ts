import { supabase } from '../../../lib/supabase';
import { mapFursuitMakers } from './utils';
import type { FursuitMaker } from '../types';

type RawFursuitMakerRow = {
  fursuit_id?: unknown;
};

export async function fetchFursuitMakersByFursuitIds(
  fursuitIds: string[],
): Promise<Map<string, FursuitMaker[]>> {
  const uniqueIds = [...new Set(fursuitIds.filter(Boolean))];
  const grouped = new Map<string, FursuitMaker[]>();

  if (uniqueIds.length === 0) {
    return grouped;
  }

  const { data, error } = await (supabase as any)
    .from('fursuit_makers')
    .select('id, fursuit_id, maker_name, normalized_maker_name, position')
    .in('fursuit_id', uniqueIds)
    .order('position', { ascending: true });

  if (error) {
    throw new Error(`We couldn't load fursuit makers: ${error.message}`);
  }

  for (const row of data ?? []) {
    const fursuitId =
      typeof (row as RawFursuitMakerRow).fursuit_id === 'string'
        ? ((row as RawFursuitMakerRow).fursuit_id as string)
        : null;

    if (!fursuitId) {
      continue;
    }

    const current = grouped.get(fursuitId) ?? [];
    grouped.set(fursuitId, [...current, row]);
  }

  for (const [fursuitId, makers] of grouped) {
    grouped.set(fursuitId, mapFursuitMakers(makers));
  }

  return grouped;
}
