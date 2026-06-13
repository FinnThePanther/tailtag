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
  const payload: Database['public']['Tables']['profiles']['Update'] = {
    is_adult: isAdult,
    age_gate_version: CURRENT_AGE_GATE_VERSION,
    updated_at: new Date().toISOString(),
  };

  if (!isAdult) {
    payload.visibility_audience = 'everyone';
  }

  const { error: rpcError } = await client.rpc('set_own_age_attestation', {
    p_age_gate_version: CURRENT_AGE_GATE_VERSION,
    p_is_adult: isAdult,
  });

  if (!rpcError) {
    return;
  }

  captureSupabaseError(rpcError, {
    scope: 'adultBoundary.updateAgeAttestation.rpc',
    userId,
  });

  const { error } = await client.from('profiles').update(payload).eq('id', userId);

  if (error) {
    captureSupabaseError(error, {
      scope: 'adultBoundary.updateAgeAttestation',
      userId,
    });
    throw new Error('We could not save your age attestation right now. Please try again.');
  }
}
