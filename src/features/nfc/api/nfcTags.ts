import { supabase } from '@/lib/supabase';
import { captureHandledException } from '@/lib/sentry';
import type {
  NfcTag,
  NfcTagStatus,
  TagCheckResult,
  TagRegistrationResult,
  TagRegistrationError,
  TagLookupResult,
} from '../types';

// Query keys
export const NFC_TAG_QUERY_KEY = 'nfc-tag';
export const nfcTagQueryKey = (fursuitId: string) =>
  [NFC_TAG_QUERY_KEY, fursuitId] as const;

// API Response types from edge functions
interface RegisterTagApiResponse {
  success?: boolean;
  tag_id?: string;
  tag_uid?: string | null;
  nfc_uid?: string | null;
  status?: NfcTagStatus;
  fursuit_id?: string | null;
  qr_token?: string | null;
  qr_download_url?: string | null;
  exists?: boolean;
  is_mine?: boolean;
  error?: string;
  code?: string;
}

interface LookupTagApiResponse {
  found: boolean;
  fursuit_id?: string;
  tag_id?: string;
  reason?: string;
  error?: string;
}

interface TagRow {
  id: string;
  nfc_uid: string | null;
  fursuit_id: string | null;
  registered_by_user_id: string;
  status: NfcTagStatus;
  registered_at: string;
  linked_at: string | null;
  updated_at: string;
}

function mapTagRowToTag(row: TagRow): NfcTag {
  return {
    uid: row.nfc_uid ?? '',
    fursuitId: row.fursuit_id,
    registeredByUserId: row.registered_by_user_id,
    status: row.status,
    registeredAt: row.registered_at,
    linkedAt: row.linked_at,
    updatedAt: row.updated_at,
  };
}

function createApiError(
  response: RegisterTagApiResponse
): TagRegistrationError {
  return {
    code: (response.code as TagRegistrationError['code']) ?? 'UNKNOWN_ERROR',
    message: response.error ?? 'An unknown error occurred',
  };
}

function resolveTagUidFromApi(
  response: RegisterTagApiResponse
): string {
  return response.nfc_uid ?? response.tag_uid ?? '';
}

/**
 * Check if a tag exists and its ownership status.
 */
export async function checkTagStatus(uid: string): Promise<TagCheckResult> {
  try {
    const { data, error } = await supabase.functions.invoke<RegisterTagApiResponse>(
      'register-tag',
      {
        body: { action: 'check', nfc_uid: uid },
      }
    );

    if (error) {
      console.error('[checkTagStatus] Error:', error);
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from check');
    }

    return {
      exists: data.exists ?? false,
      status: data.status,
      fursuitId: data.fursuit_id,
      isMine: data.is_mine,
    };
  } catch (error) {
    captureHandledException(error, {
      scope: 'nfc.checkTagStatus',
      tagUid: uid,
    });
    throw error;
  }
}

/**
 * Register a new NFC tag (creates with pending_link status).
 */
export async function registerTag(
  uid: string
): Promise<TagRegistrationResult | TagRegistrationError> {
  try {
    const { data, error } = await supabase.functions.invoke<RegisterTagApiResponse>(
      'register-tag',
      {
        body: { action: 'register', nfc_uid: uid },
      }
    );

    if (error) {
      console.error('[registerTag] Invoke error:', error);
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from register');
    }

    if (data.error) {
      return createApiError(data);
    }

    return {
      success: true,
      tagUid: resolveTagUidFromApi(data),
      status: data.status!,
    };
  } catch (error) {
    captureHandledException(error, {
      scope: 'nfc.registerTag',
      tagUid: uid,
    });

    return {
      code: 'NETWORK_ERROR',
      message: 'Failed to connect to server',
    };
  }
}

/**
 * Link a tag to a fursuit (updates to active status).
 */
export async function linkTagToFursuit(
  uid: string,
  fursuitId: string
): Promise<TagRegistrationResult | TagRegistrationError> {
  try {
    const { data, error } = await supabase.functions.invoke<RegisterTagApiResponse>(
      'register-tag',
      {
        body: { action: 'link', nfc_uid: uid, fursuit_id: fursuitId },
      }
    );

    if (error) {
      console.error('[linkTagToFursuit] Invoke error:', error);
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from link');
    }

    if (data.error) {
      return createApiError(data);
    }

    return {
      success: true,
      tagUid: resolveTagUidFromApi(data),
      status: data.status!,
      fursuitId: data.fursuit_id,
    };
  } catch (error) {
    captureHandledException(error, {
      scope: 'nfc.linkTagToFursuit',
      tagUid: uid,
      fursuitId,
    });

    return {
      code: 'NETWORK_ERROR',
      message: 'Failed to connect to server',
    };
  }
}

/**
 * Unlink a tag from its fursuit (updates to revoked status).
 */
export async function unlinkTag(
  uid: string
): Promise<TagRegistrationResult | TagRegistrationError> {
  try {
    const { data, error } = await supabase.functions.invoke<RegisterTagApiResponse>(
      'register-tag',
      {
        body: { action: 'unlink', nfc_uid: uid },
      }
    );

    if (error) {
      console.error('[unlinkTag] Invoke error:', error);
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from unlink');
    }

    if (data.error) {
      return createApiError(data);
    }

    return {
      success: true,
      tagUid: resolveTagUidFromApi(data),
      status: data.status!,
    };
  } catch (error) {
    captureHandledException(error, {
      scope: 'nfc.unlinkTag',
      tagUid: uid,
    });

    return {
      code: 'NETWORK_ERROR',
      message: 'Failed to connect to server',
    };
  }
}

/**
 * Mark a tag as lost.
 */
export async function markTagLost(
  uid: string
): Promise<TagRegistrationResult | TagRegistrationError> {
  try {
    const { data, error } = await supabase.functions.invoke<RegisterTagApiResponse>(
      'register-tag',
      {
        body: { action: 'mark_lost', nfc_uid: uid },
      }
    );

    if (error) {
      console.error('[markTagLost] Invoke error:', error);
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from mark_lost');
    }

    if (data.error) {
      return createApiError(data);
    }

    return {
      success: true,
      tagUid: resolveTagUidFromApi(data),
      status: data.status!,
      fursuitId: data.fursuit_id,
    };
  } catch (error) {
    captureHandledException(error, {
      scope: 'nfc.markTagLost',
      tagUid: uid,
    });

    return {
      code: 'NETWORK_ERROR',
      message: 'Failed to connect to server',
    };
  }
}

/**
 * Mark a lost tag as found/active.
 */
export async function markTagFound(
  uid: string
): Promise<TagRegistrationResult | TagRegistrationError> {
  try {
    const { data, error } = await supabase.functions.invoke<RegisterTagApiResponse>(
      'register-tag',
      {
        body: { action: 'mark_found', nfc_uid: uid },
      }
    );

    if (error) {
      console.error('[markTagFound] Invoke error:', error);
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from mark_found');
    }

    if (data.error) {
      return createApiError(data);
    }

    return {
      success: true,
      tagUid: resolveTagUidFromApi(data),
      status: data.status!,
      fursuitId: data.fursuit_id,
    };
  } catch (error) {
    captureHandledException(error, {
      scope: 'nfc.markTagFound',
      tagUid: uid,
    });

    return {
      code: 'NETWORK_ERROR',
      message: 'Failed to connect to server',
    };
  }
}

/**
 * Fetch the NFC tag for a specific fursuit.
 * Returns null if no active tag exists.
 */
export async function fetchFursuitTag(
  fursuitId: string
): Promise<NfcTag | null> {
  try {
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .eq('fursuit_id', fursuitId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      console.error('[fetchFursuitTag] Error:', error);
      throw error;
    }

    if (!data) {
      return null;
    }

    return mapTagRowToTag(data as TagRow);
  } catch (error) {
    captureHandledException(error, {
      scope: 'nfc.fetchFursuitTag',
      fursuitId,
    });
    throw error;
  }
}

/**
 * Look up an NFC tag for catching purposes.
 * Returns the fursuit ID if the tag is active, or a reason why not.
 */
export async function lookupTagForCatch(uid: string): Promise<TagLookupResult> {
  try {
    const { data, error } = await supabase.functions.invoke<LookupTagApiResponse>(
      'lookup-tag',
      {
        body: { nfc_uid: uid },
      }
    );

    if (error) {
      console.error('[lookupTagForCatch] Invoke error:', error);
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from lookup');
    }

    if (data.found && data.fursuit_id) {
      return {
        found: true,
        fursuitId: data.fursuit_id,
      };
    }

    return {
      found: false,
      reason: (data.reason as TagLookupResult extends { found: false }
        ? TagLookupResult['reason']
        : never) ?? 'TAG_NOT_REGISTERED',
    };
  } catch (error) {
    captureHandledException(error, {
      scope: 'nfc.lookupTagForCatch',
      tagUid: uid,
    });

    // Return not registered on error for graceful degradation
    return {
      found: false,
      reason: 'TAG_NOT_REGISTERED',
    };
  }
}
