import { supabase } from '@/lib/supabase';
import { captureSupabaseError } from '@/lib/sentry';
import type { Database } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProfileSummary } from '@/features/profile';

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
  const client = supabase as SupabaseClient<Database>;
  const { error } = await client
    .from('profiles')
    .update({
      is_adult: isAdult,
      age_gate_version: CURRENT_AGE_GATE_VERSION,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    captureSupabaseError(error, {
      scope: 'adultBoundary.updateAgeAttestation',
      userId,
    });
    throw new Error(`Could not save age attestation: ${error.message}`);
  }
}
