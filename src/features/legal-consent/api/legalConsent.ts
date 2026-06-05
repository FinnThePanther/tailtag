import { supabase } from '@/lib/supabase';
import { captureSupabaseError } from '@/lib/sentry';
import type { Database } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';

export const CURRENT_LEGAL_TERMS_VERSION = 1;

type LegalConsentProfile = {
  legal_terms_accepted_at?: string | null;
  legal_terms_version?: number | null;
};

export function profileNeedsLegalConsent(profile: LegalConsentProfile | null | undefined): boolean {
  if (!profile) {
    return false;
  }

  return (
    typeof profile.legal_terms_accepted_at !== 'string' ||
    profile.legal_terms_version !== CURRENT_LEGAL_TERMS_VERSION
  );
}

export async function updateLegalTermsAcceptance(userId: string): Promise<{
  acceptedAt: string;
  version: number;
}> {
  const acceptedAt = new Date().toISOString();
  const client = supabase as SupabaseClient<Database>;

  const { error } = await client
    .from('profiles')
    .update({
      legal_terms_accepted_at: acceptedAt,
      legal_terms_version: CURRENT_LEGAL_TERMS_VERSION,
      updated_at: acceptedAt,
    })
    .eq('id', userId);

  if (error) {
    captureSupabaseError(error, {
      scope: 'legalConsent.updateLegalTermsAcceptance',
      userId,
    });
    throw new Error(`Could not save legal acceptance: ${error.message}`);
  }

  return {
    acceptedAt,
    version: CURRENT_LEGAL_TERMS_VERSION,
  };
}
