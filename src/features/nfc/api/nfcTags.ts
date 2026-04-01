import { supabase } from '@/lib/supabase';
import { captureHandledException } from '@/lib/sentry';
import { TAG_QR_BUCKET } from '@/constants/storage';
import type {
  NfcTag,
  NfcTagStatus,
  TagCheckResult,
  TagRegistrationResult,
  TagRegistrationError,
  TagLookupResult,
  TagQrActionResult,
  QrReadyFursuit,
} from '../types';

// Query keys
export const NFC_TAG_QUERY_KEY = 'nfc-tag';
export const nfcTagQueryKey = (fursuitId: string) =>
  [NFC_TAG_QUERY_KEY, fursuitId] as const;
export const FURSUIT_QR_TAG_QUERY_KEY = 'fursuit-qr-tag';
export const fursuitQrQueryKey = (fursuitId: string) =>
  [FURSUIT_QR_TAG_QUERY_KEY, fursuitId] as const;
export const QR_READY_SUITS_QUERY_KEY = 'qr-ready-suits';
export const qrReadySuitsQueryKey = (userId: string) =>
  [QR_READY_SUITS_QUERY_KEY, userId] as const;

const DEFAULT_QR_SIGNED_URL_TTL = 5 * 60; // 5 minutes

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
  qr_asset_path?: string | null;
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
  qr_token: string | null;
  qr_token_created_at: string | null;
  qr_asset_path: string | null;
}

function getTagTelemetry(options: {
  scope: string;
  uid?: string | null;
  tagId?: string | null;
  fursuitId?: string | null;
  userId?: string | null;
  assetPath?: string | null;
  hasQrToken?: boolean;
}) {
  return {
    scope: options.scope,
    fursuitId: options.fursuitId ?? undefined,
    userId: options.userId ?? undefined,
    assetPath: options.assetPath ?? undefined,
    hasTagUid: Boolean(options.uid),
    hasTagId: Boolean(options.tagId),
    hasQrToken: options.hasQrToken ?? false,
  };
}

function mapTagRowToTag(row: TagRow): NfcTag {
  const kind: NfcTag['kind'] = row.nfc_uid ? 'nfc' : 'qr';
  return {
    id: row.id,
    kind,
    uid: row.nfc_uid ?? 'QR-ONLY',
    fursuitId: row.fursuit_id,
    registeredByUserId: row.registered_by_user_id,
    status: row.status,
    registeredAt: row.registered_at,
    linkedAt: row.linked_at,
    updatedAt: row.updated_at,
    qrToken: row.qr_token,
    qrTokenCreatedAt: row.qr_token_created_at,
    qrAssetPath: row.qr_asset_path,
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
  return response.nfc_uid ?? response.tag_uid ?? 'QR-ONLY';
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
    qrToken: data.qr_token ?? null,
    qrDownloadUrl: data.qr_download_url ?? null,
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

async function handleQrActionResponse(
  data: RegisterTagApiResponse | null | undefined,
  fallbackTagId: string
): Promise<TagQrActionResult> {
  if (!data) {
    throw new Error('No data returned from QR action');
  }
  if (data.error) {
    throw createApiError(data);
  }

  return {
    success: true,
    tagId: data.tag_id ?? fallbackTagId,
    qrToken: data.qr_token ?? null,
    qrDownloadUrl: data.qr_download_url ?? null,
  };
}

export async function generateQrForTag(
  tagId: string
): Promise<TagQrActionResult | TagRegistrationError> {
  try {
    const { data, error } = await supabase.functions.invoke<RegisterTagApiResponse>('register-tag', {
      body: { action: 'generate_qr', tag_id: tagId },
    });

    if (error) {
      throw error;
    }

    return await handleQrActionResponse(data, tagId);
  } catch (error) {
    captureHandledException(error, getTagTelemetry({ scope: 'nfc.generateQrForTag', tagId }));

    if (typeof error === 'object' && error !== null && 'code' in (error as any)) {
      return error as TagRegistrationError;
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: 'We could not generate a QR code. Please try again.',
    };
  }
}

export async function rotateQrForTag(
  tagId: string
): Promise<TagQrActionResult | TagRegistrationError> {
  try {
    const { data, error } = await supabase.functions.invoke<RegisterTagApiResponse>('register-tag', {
      body: { action: 'rotate_qr', tag_id: tagId },
    });

    if (error) {
      throw error;
    }

    return await handleQrActionResponse(data, tagId);
  } catch (error) {
    captureHandledException(error, getTagTelemetry({ scope: 'nfc.rotateQrForTag', tagId }));

    if (typeof error === 'object' && error !== null && 'code' in (error as any)) {
      return error as TagRegistrationError;
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: 'We could not rotate that QR code. Please try again.',
    };
  }
}

export async function revokeQrForTag(
  tagId: string
): Promise<TagQrActionResult | TagRegistrationError> {
  try {
    const { data, error } = await supabase.functions.invoke<RegisterTagApiResponse>('register-tag', {
      body: { action: 'revoke_qr', tag_id: tagId },
    });

    if (error) {
      throw error;
    }

    return await handleQrActionResponse(data, tagId);
  } catch (error) {
    captureHandledException(error, getTagTelemetry({ scope: 'nfc.revokeQrForTag', tagId }));

    if (typeof error === 'object' && error !== null && 'code' in (error as any)) {
      return error as TagRegistrationError;
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: 'We could not revoke that QR code. Please try again.',
    };
  }
}

export async function createSignedQrDownloadUrl(
  assetPath: string,
  expiresInSeconds = DEFAULT_QR_SIGNED_URL_TTL
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(TAG_QR_BUCKET)
    .createSignedUrl(assetPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    captureHandledException(
      error ?? new Error('Failed to create signed QR URL'),
      getTagTelemetry({ scope: 'nfc.createSignedQrDownloadUrl', assetPath })
    );
    throw new Error('We could not generate a download link. Please try again.');
  }

  return data.signedUrl;
}

export async function fetchQrReadySuits(userId: string): Promise<QrReadyFursuit[]> {
  try {
    const client = supabase as any;
    const { data, error } = await client
      .from('tags')
      .select(`
        id,
        status,
        qr_token,
        qr_token_created_at,
        qr_asset_path,
        fursuit_id,
        linked_at,
        fursuit:fursuits (
          id,
          name,
          avatar_url,
          owner_id,
          catch_mode
        )
      `)
      .eq('registered_by_user_id', userId)
      .in('status', ['active', 'lost'])
      .not('qr_token', 'is', null)
      .not('fursuit_id', 'is', null)
      .order('linked_at', { ascending: false });

    if (error) {
      captureHandledException(error, getTagTelemetry({ scope: 'nfc.fetchQrReadySuits', userId }));
      throw new Error(`We couldn't load your QR codes: ${error.message}`);
    }

    return (data ?? [])
      .map((row: any) => {
        const fursuit = row.fursuit;
        if (!row.qr_token || !fursuit || fursuit.owner_id !== userId) {
          return null;
        }

        return {
          tagId: row.id,
          tagStatus: row.status ?? 'active',
          qrToken: row.qr_token,
          qrTokenCreatedAt: row.qr_token_created_at ?? null,
          qrAssetPath: row.qr_asset_path ?? null,
          fursuitId: fursuit.id,
          fursuitName: fursuit.name ?? 'Fursuit',
          fursuitAvatarUrl: fursuit.avatar_url ?? null,
          fursuitCatchMode: fursuit.catch_mode ?? null,
        } as QrReadyFursuit;
      })
      .filter(Boolean) as QrReadyFursuit[];
  } catch (error) {
    captureHandledException(error, getTagTelemetry({ scope: 'nfc.fetchQrReadySuits', userId }));
    throw error instanceof Error
      ? error
      : new Error('We could not load your QR codes. Please try again.');
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
 * Fetch the dedicated QR tag for a specific fursuit.
 * Returns null if no QR tag exists yet.
 */
export async function fetchFursuitQrTag(fursuitId: string): Promise<NfcTag | null> {
  try {
    const client = supabase as any;
    const { data, error } = await client
      .from('tags')
      .select('*')
      .eq('fursuit_id', fursuitId)
      .not('qr_token', 'is', null)
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
    captureHandledException(error, getTagTelemetry({ scope: 'nfc.fetchFursuitQrTag', fursuitId }));
    throw error;
  }
}

export async function ensureQrBackupForFursuit(fursuitId: string): Promise<NfcTag> {
  const existing = await fetchFursuitQrTag(fursuitId);
  if (existing) {
    return existing;
  }

  try {
    const { data: registrationData, error: registrationError } =
      await supabase.functions.invoke<RegisterTagApiResponse>('register-tag', {
        body: { action: 'register', generate_qr: true },
      });

    if (registrationError) {
      throw registrationError;
    }

    if (!registrationData) {
      throw new Error('No data returned while creating QR tag');
    }

    if (registrationData.error) {
      const apiError = createApiError(registrationData);
      throw new Error(apiError.message);
    }

    const qrTagId = registrationData.tag_id;
    if (!qrTagId) {
      throw new Error('Missing tag_id while creating QR tag');
    }

    const linkResult = await linkTagByIdToFursuit(qrTagId, fursuitId);
    if ('code' in linkResult) {
      throw new Error(linkResult.message);
    }

    const linkedTag = await fetchFursuitQrTag(fursuitId);
    if (!linkedTag) {
      throw new Error('QR tag linked but could not be loaded');
    }

    return linkedTag;
  } catch (error) {
    captureHandledException(
      error,
      getTagTelemetry({ scope: 'nfc.ensureQrBackupForFursuit', fursuitId })
    );

    throw error instanceof Error
      ? error
      : new Error('We could not prepare your QR backup. Please try again.');
  }
}

/**
 * Look up an NFC tag for catching purposes.
 * Returns the fursuit ID if the tag is active, or a reason why not.
 */
type LookupTagInput = string | { nfcUid?: string | null; qrToken?: string | null };

export async function lookupTagForCatch(input: LookupTagInput): Promise<TagLookupResult> {
  const payload =
    typeof input === 'string'
      ? { nfc_uid: input, qr_token: undefined }
      : {
          nfc_uid: input.nfcUid ?? undefined,
          qr_token: input.qrToken ?? undefined,
        };

  if (!payload.nfc_uid && !payload.qr_token) {
    throw new Error('Lookup requires an NFC UID or QR token');
  }

  try {
    const { data, error } = await supabase.functions.invoke<LookupTagApiResponse>(
      'lookup-tag',
      {
        body: payload,
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
        uid: payload.nfc_uid,
        hasQrToken: Boolean(payload.qr_token),
      })
    );

    // Return not registered on error for graceful degradation
    return {
      found: false,
      reason: 'TAG_NOT_REGISTERED',
    };
  }
}
