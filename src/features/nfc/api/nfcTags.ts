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

function getTagTelemetry(options: {
  scope: string;
  uid?: string | null;
  tagId?: string | null;
  fursuitId?: string | null;
  userId?: string | null;
}) {
  return {
    scope: options.scope,
    fursuitId: options.fursuitId ?? undefined,
    userId: options.userId ?? undefined,
    hasTagUid: Boolean(options.uid),
    hasTagId: Boolean(options.tagId),
  };
}

function mapTagRowToTag(row: TagRow): NfcTag {
  return {
    id: row.id,
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

function mapRegistrationResponse(
  data: RegisterTagApiResponse
): TagRegistrationResult {
  if (!data.tag_id) {
    throw new Error('Missing tag_id in register-tag response');
  }

  return {
    success: true,
    tagId: data.tag_id,
    tagUid: resolveTagUidFromApi(data),
    status: data.status ?? 'pending_link',
    fursuitId: data.fursuit_id,
  };
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
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from check');
    }

    return {
      exists: data.exists ?? false,
      tagId: data.tag_id,
      status: data.status,
      fursuitId: data.fursuit_id,
      isMine: data.is_mine,
    };
  } catch (error) {
    captureHandledException(error, getTagTelemetry({ scope: 'nfc.checkTagStatus', uid }));
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
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from register');
    }

    if (data.error) {
      return createApiError(data);
    }

    return mapRegistrationResponse(data);
  } catch (error) {
    captureHandledException(error, getTagTelemetry({ scope: 'nfc.registerTag', uid }));

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
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from link');
    }

    if (data.error) {
      return createApiError(data);
    }

    return mapRegistrationResponse(data);
  } catch (error) {
    captureHandledException(
      error,
      getTagTelemetry({ scope: 'nfc.linkTagToFursuit', uid, fursuitId })
    );

    return {
      code: 'NETWORK_ERROR',
      message: 'Failed to connect to server',
    };
  }
}

export async function linkTagByIdToFursuit(
  tagId: string,
  fursuitId: string
): Promise<TagRegistrationResult | TagRegistrationError> {
  try {
    const { data, error } = await supabase.functions.invoke<RegisterTagApiResponse>(
      'register-tag',
      {
        body: { action: 'link', tag_id: tagId, fursuit_id: fursuitId },
      }
    );

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from link');
    }

    if (data.error) {
      return createApiError(data);
    }

    return mapRegistrationResponse(data);
  } catch (error) {
    captureHandledException(
      error,
      getTagTelemetry({ scope: 'nfc.linkTagByIdToFursuit', tagId, fursuitId })
    );

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
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from unlink');
    }

    if (data.error) {
      return createApiError(data);
    }

    return mapRegistrationResponse(data);
  } catch (error) {
    captureHandledException(error, getTagTelemetry({ scope: 'nfc.unlinkTag', uid }));

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
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from mark_lost');
    }

    if (data.error) {
      return createApiError(data);
    }

    return mapRegistrationResponse(data);
  } catch (error) {
    captureHandledException(error, getTagTelemetry({ scope: 'nfc.markTagLost', uid }));

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
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from mark_found');
    }

    if (data.error) {
      return createApiError(data);
    }

    return mapRegistrationResponse(data);
  } catch (error) {
    captureHandledException(error, getTagTelemetry({ scope: 'nfc.markTagFound', uid }));

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
    const client = supabase as any;
    const { data, error } = await client
      .from('tags')
      .select('*')
      .eq('fursuit_id', fursuitId)
      .not('nfc_uid', 'is', null)
      .in('status', ['active', 'lost'])
      .order('linked_at', { ascending: false })
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    return mapTagRowToTag(data as TagRow);
  } catch (error) {
    captureHandledException(error, getTagTelemetry({ scope: 'nfc.fetchFursuitTag', fursuitId }));
    throw error;
  }
}

/**
 * Look up an NFC tag for catching purposes.
 * Returns the fursuit ID if the tag is active, or a reason why not.
 */
export async function lookupTagForCatch(nfcUid: string): Promise<TagLookupResult> {
  if (!nfcUid) {
    throw new Error('Lookup requires an NFC UID');
  }

  try {
    const { data, error } = await supabase.functions.invoke<LookupTagApiResponse>(
      'lookup-tag',
      {
        body: { nfc_uid: nfcUid },
      }
    );

    if (error) {
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
    captureHandledException(
      error,
      getTagTelemetry({
        scope: 'nfc.lookupTagForCatch',
        uid: nfcUid,
      })
    );

    // Return not registered on error for graceful degradation
    return {
      found: false,
      reason: 'TAG_NOT_REGISTERED',
    };
  }
}
