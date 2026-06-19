import { supabase } from '../../../lib/supabase';
import { normalizeUniqueCodeInput } from '../../../utils/code';

export async function isFursuitUniqueCodeAvailable(
  uniqueCode: string,
  excludingFursuitId?: string | null,
): Promise<boolean> {
  const normalizedCode = normalizeUniqueCodeInput(uniqueCode);
  const { data, error } = await (supabase as any).rpc('is_fursuit_unique_code_available', {
    p_unique_code: normalizedCode,
    p_excluding_fursuit_id: excludingFursuitId ?? null,
  });

  if (error) {
    throw error;
  }

  return data === true;
}
