import { supabase } from '../../../lib/supabase';
import type { ProfileSummary } from '../../profile';

export const CURRENT_AGE_GATE_VERSION = 1;

export type VisibilityAudience = 'everyone' | 'adults_only';

export function normalizeVisibilityAudience(value: unknown): VisibilityAudience {
  return value === 'adults_only' ? 'adults_only' : 'everyone';
}

export function profileNeedsAgeAttestation(profile: ProfileSummary | null | undefined): boolean {
  if (!profile) {
    return false;
  }

  return (
    typeof profile.is_adult !== 'boolean' || profile.age_gate_version < CURRENT_AGE_GATE_VERSION
  );
}

export async function updateAgeAttestation(userId: string, isAdult: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from('profiles')
    .update({
      is_adult: isAdult,
      age_gate_version: CURRENT_AGE_GATE_VERSION,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(`Could not save age attestation: ${error.message}`);
  }
}
