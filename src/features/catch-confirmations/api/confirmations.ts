import { Platform } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '../../../lib/supabase';
import {
  captureFeatureError,
  captureHandledException,
  captureSupabaseError,
} from '../../../lib/sentry';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../../lib/runtimeConfig';
import {
  CATCH_PHOTO_BUCKET,
  FURSUIT_BUCKET,
  PROFILE_AVATAR_BUCKET,
} from '../../../constants/storage';
import {
  buildAuthenticatedStorageObjectUrl,
  resolveStorageMediaUrl,
} from '../../../utils/supabase-image';
import { loadUriAsUint8Array } from '../../../utils/files';
import { fetchConventionFursuitPickerRoster } from '@/features/conventions/api/conventions';
import {
  createClientAttemptId,
  getCatchPerformanceAppVersion,
  type CatchPerformanceResult,
} from '../lib/catchPerformance';
import type {
  CatchPhotoSource,
  CatchPhotoUploadState,
  PendingCatch,
  ConfirmCatchResult,
  CreateCatchResult,
  CreateCatchParams,
  ReciprocalCatchOfferResult,
  ReciprocalCatchOfferStatus,
  UpdateCatchPhotoResult,
  MarkCatchPhotoUploadFailedResult,
} from '@/features/catch-confirmations/types';
import type { Database } from '@/types/database';

// Query keys
export const PENDING_CATCHES_QUERY_KEY = 'pending-catches';

export const pendingCatchesQueryKey = (userId: string) =>
  [PENDING_CATCHES_QUERY_KEY, userId] as const;

// Stale times
export const PENDING_CATCHES_STALE_TIME = 15 * 1000; // 15 seconds
const EDGE_FUNCTION_TIMEOUT_MS = 15 * 1000;
export const CODE_CATCH_OUTBOX_TIMEOUT_MS = 5 * 1000;

type CreateCatchError = Error & {
  catchPerformanceResult?: CatchPerformanceResult;
  edgeRequestMs?: number | null;
  errorCode?: string | null;
};

const isSupabaseError = (
  error: unknown,
): error is { code?: string; details?: string; hint?: string; message?: string } =>
  typeof error === 'object' &&
  error !== null &&
  ('code' in error || 'details' in error || 'hint' in error);

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const roundMs = (duration: number) => Math.max(0, Math.round(duration));

function withCatchPerformanceError(
  error: Error,
  options: {
    result: CatchPerformanceResult;
    edgeRequestMs?: number | null;
    errorCode?: string | null;
  },
): CreateCatchError {
  const enrichedError = error as CreateCatchError;
  enrichedError.catchPerformanceResult = options.result;
  enrichedError.edgeRequestMs = options.edgeRequestMs ?? null;
  enrichedError.errorCode = options.errorCode ?? null;
  return enrichedError;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function normalizeCatchPhotoSource(raw: unknown): CatchPhotoSource | null {
  return raw === 'camera' || raw === 'gallery' ? raw : null;
}

export function normalizeCatchPhotoUploadState(raw: unknown): CatchPhotoUploadState {
  return raw === 'pending_upload' || raw === 'uploaded' || raw === 'failed' ? raw : 'not_required';
}

function normalizeReciprocalOfferStatus(raw: unknown): ReciprocalCatchOfferStatus {
  return raw === 'COMPLETED' || raw === 'FAILED' || raw === 'CANCELED' ? raw : 'PENDING';
}

function normalizeReciprocalOffer(raw: unknown): ReciprocalCatchOfferResult | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const value = raw as Record<string, unknown>;
  return {
    offerId: stringField(value.offer_id),
    status: normalizeReciprocalOfferStatus(value.status),
    reciprocalCatchId: stringField(value.reciprocal_catch_id),
    failureReason: stringField(value.failure_reason),
    eventEnqueued: value.event_enqueued === true,
    offeredFursuitId: stringField(value.offered_fursuit_id),
    offeredFursuitName: stringField(value.offered_fursuit_name),
    offeredFursuitAvatarPath: stringField(value.offered_fursuit_avatar_path),
    offeredFursuitAvatarUrl: stringField(value.offered_fursuit_avatar_url),
    recipientProfileId: stringField(value.recipient_profile_id),
  };
}

async function wakeGameplayQueue(): Promise<void> {
  const { error } = await supabase.rpc('process_gameplay_queue_if_active');
  if (error) {
    throw error;
  }
}

/**
 * Fetch all pending catches for the user's fursuits
 */
export async function fetchPendingCatches(userId: string): Promise<PendingCatch[]> {
  const { data, error } = await supabase.rpc('get_pending_catches', {
    p_user_id: userId,
  });

  if (error) {
    throw new Error("We couldn't load pending catches. Please try again.");
  }

  if (!data || !Array.isArray(data)) {
    return [];
  }

  return data.map((row) => ({
    catchId: row.catch_id,
    catcherId: row.catcher_id,
    catcherUsername: row.catcher_username ?? 'Unknown',
    catcherAvatarPath: null,
    catcherAvatarUrl: resolveStorageMediaUrl({
      bucket: PROFILE_AVATAR_BUCKET,
      path: null,
      legacyUrl: row.catcher_avatar_url ?? null,
    }),
    fursuitId: row.fursuit_id,
    fursuitName: row.fursuit_name ?? 'Unknown Fursuit',
    fursuitAvatarPath: null,
    fursuitAvatarUrl: resolveStorageMediaUrl({
      bucket: FURSUIT_BUCKET,
      path: null,
      legacyUrl: row.fursuit_avatar_url ?? null,
    }),
    conventionId: row.convention_id,
    conventionName: row.convention_name ?? 'Unknown Convention',
    caughtAt: row.caught_at,
    expiresAt: row.expires_at,
    timeRemaining: String(row.time_remaining ?? ''),
    catchPhotoPath: null,
    catchPhotoUrl: resolveStorageMediaUrl({
      bucket: CATCH_PHOTO_BUCKET,
      path: null,
      legacyUrl: row.catch_photo_url ?? null,
    }),
    catchPhotoSource: normalizeCatchPhotoSource(row.catch_photo_source),
    photoUploadState: normalizeCatchPhotoUploadState(row.photo_upload_state),
    reciprocalOfferId: row.reciprocal_offer_id ?? null,
    reciprocalFursuitId: row.reciprocal_fursuit_id ?? null,
    reciprocalFursuitName: row.reciprocal_fursuit_name ?? null,
    reciprocalFursuitAvatarUrl: resolveStorageMediaUrl({
      bucket: FURSUIT_BUCKET,
      path: null,
      legacyUrl: row.reciprocal_fursuit_avatar_url ?? null,
    }),
  }));
}

/**
 * Confirm or reject a pending catch.
 * When accepting, the catch_confirmed event is emitted server-side by the RPC function.
 *
 * Idempotency:
 * This function is naturally idempotent - the RPC uses `WHERE status = 'PENDING'` which
 * prevents the same catch from being confirmed twice. Retrying with the same catchId will
 * fail with "Catch not found or already decided", which is safe behavior for duplicate requests.
 * The row-level lock (FOR UPDATE) prevents race conditions during concurrent requests.
 */
export async function confirmCatch(
  catchId: string,
  userId: string,
  decision: 'accept' | 'reject',
  reason?: string,
  _conventionId?: string,
): Promise<ConfirmCatchResult> {
  const { data, error } = await supabase.rpc('confirm_catch', {
    p_catch_id: catchId,
    p_user_id: userId,
    p_decision: decision,
    p_reason: reason,
  });

  if (error) {
    throw new Error(
      decision === 'accept'
        ? "We couldn't approve this catch. Please try again."
        : "We couldn't decline this catch. Please try again.",
    );
  }

  const result = data as { success: boolean; message?: string; reciprocal_offer?: unknown } | null;

  if (!result?.success) {
    throw new Error(result?.message ?? 'Failed to process catch decision.');
  }

  if (decision === 'accept') {
    void wakeGameplayQueue().catch((queueWakeError) => {
      captureFeatureError(queueWakeError, {
        scope: 'catch-confirmations.confirmCatch',
        action: 'wakeGameplayQueue',
        catchId,
      });
    });
  }

  return {
    success: true,
    catchId,
    decision,
    message: result.message,
    reciprocalOffer: normalizeReciprocalOffer(result.reciprocal_offer),
  };
}

/**
 * Create a catch via the Edge Function.
 * Handles auto-accept vs manual approval based on the owner's profile settings.
 */
export async function createCatch(params: CreateCatchParams): Promise<CreateCatchResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const supabaseKey = SUPABASE_ANON_KEY;
  const clientAttemptId = params.clientAttemptId ?? createClientAttemptId();

  if (!accessToken) {
    throw new Error('You must be signed in to catch fursuits.');
  }

  const supabaseUrl = SUPABASE_URL;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration not set.');
  }

  // Edge Functions can commit the catch before slower notification/achievement work finishes.
  const controller = new AbortController();
  const effectiveTimeoutMs = params.timeoutMs ?? EDGE_FUNCTION_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  const edgeRequestStartedAt = now();
  let edgeRequestMs: number | null = null;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/create-catch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseKey,
        'Content-Type': 'application/json',
        'x-client-attempt-id': clientAttemptId,
      },
      body: JSON.stringify({
        client_attempt_id: clientAttemptId,
        app_version: getCatchPerformanceAppVersion(),
        platform: Platform.OS,
        network_type: null,
        method:
          params.method ??
          (params.photoSource === 'gallery'
            ? 'gallery_photo'
            : params.photoSource === 'camera'
              ? 'camera_photo'
              : 'code'),
        fursuit_id: params.fursuitId,
        fursuit_code: params.fursuitCode ?? null,
        convention_id: params.conventionId,
        force_pending: params.forcePending ?? false,
        has_photo:
          Boolean(params.hasPhoto) || Boolean(params.photoPath) || Boolean(params.photoUrl),
        catch_photo_path: params.photoPath ?? null,
        catch_photo_url: params.photoUrl ?? null,
        catch_photo_source: params.photoSource ?? null,
        photo_upload_state: params.photoUploadState ?? null,
        reciprocal_fursuit_id: params.reciprocalFursuitId ?? null,
      }),
      signal: controller.signal,
    });

    edgeRequestMs = roundMs(now() - edgeRequestStartedAt);
    clearTimeout(timeoutId);

    const responseData = await response.json();

    if (!response.ok) {
      const errorMessage = responseData?.error ?? 'Failed to create catch';
      const errorCode = stringField(responseData?.error_code);

      captureFeatureError(new Error(errorMessage), {
        scope: 'catch-confirmations.createCatch',
        action: 'edge-function',
        clientAttemptId,
        fursuitId: params.fursuitId,
        statusCode: response.status,
        edgeRequestMs,
      });

      // Return user-friendly messages for known errors
      if (errorMessage === 'This fursuit is not available to your account.') {
        throw withCatchPerformanceError(new Error(errorMessage), {
          result: 'failed',
          edgeRequestMs,
          errorCode,
        });
      }
      if (
        errorCode === 'convention_catch_closed' ||
        errorMessage.includes('new catches are closed')
      ) {
        throw withCatchPerformanceError(new Error(errorMessage), {
          result: 'failed',
          edgeRequestMs,
          errorCode: 'convention_catch_closed',
        });
      }
      if (errorCode === 'convention_not_live' || errorMessage.includes('Convention is not live')) {
        throw withCatchPerformanceError(
          new Error(
            'Catching is not open for that convention anymore. Refresh your convention and try again.',
          ),
          { result: 'failed', edgeRequestMs, errorCode: 'convention_not_live' },
        );
      }
      if (errorMessage.includes('Cannot catch your own')) {
        throw withCatchPerformanceError(
          new Error(
            'That tag belongs to one of your own suits. Trade codes with friends to grow your collection.',
          ),
          { result: 'failed', edgeRequestMs, errorCode },
        );
      }
      if (errorMessage.includes('back-tag') || errorMessage.includes('Back-tag')) {
        throw withCatchPerformanceError(new Error(errorMessage), {
          result: 'failed',
          edgeRequestMs,
          errorCode,
        });
      }
      if (errorMessage.includes('share a playable convention')) {
        throw withCatchPerformanceError(
          new Error(
            'This suit is not catchable at your playable convention yet. Both players must be Ready to catch for the same live event, and the fursuit owner must list that specific suit for the event.',
          ),
          { result: 'failed', edgeRequestMs, errorCode },
        );
      }
      if (errorMessage.includes('not accepting gallery catches')) {
        throw withCatchPerformanceError(
          new Error(
            'This convention is no longer accepting gallery catches. Gallery catches can be submitted during the event and for three local days after it ends.',
          ),
          { result: 'failed', edgeRequestMs, errorCode },
        );
      }
      if (errorMessage.includes('already caught') || errorMessage.includes('pending')) {
        throw withCatchPerformanceError(
          new Error(
            'You already caught this suit at this convention. Try catching them at another con!',
          ),
          { result: 'failed', edgeRequestMs, errorCode },
        );
      }
      if (errorMessage.includes('not found')) {
        throw withCatchPerformanceError(
          new Error(
            "We couldn't find a fursuit with that code. Double-check the letters and try again.",
          ),
          { result: 'failed', edgeRequestMs, errorCode },
        );
      }
      if (response.status === 403) {
        throw withCatchPerformanceError(new Error('You cannot catch this fursuit.'), {
          result: 'failed',
          edgeRequestMs,
          errorCode,
        });
      }

      throw withCatchPerformanceError(new Error("We couldn't save that catch. Please try again."), {
        result: 'failed',
        edgeRequestMs,
        errorCode,
      });
    }

    const result: CreateCatchResult = {
      catchId: responseData.catch_id,
      clientAttemptId:
        typeof responseData.client_attempt_id === 'string' && responseData.client_attempt_id
          ? responseData.client_attempt_id
          : clientAttemptId,
      status: responseData.status,
      expiresAt: responseData.expires_at ?? null,
      catchNumber: responseData.catch_number ?? null,
      requiresApproval: responseData.requires_approval ?? false,
      fursuitOwnerId: stringField(responseData.fursuit_owner_id),
      conventionId: responseData.convention_id ?? params.conventionId ?? null,
      fursuitId: responseData.fursuit_id ?? params.fursuitId,
      fursuitName: responseData.fursuit_name,
      fursuitAvatarPath: responseData.fursuit_avatar_path ?? null,
      fursuitAvatarUrl: responseData.fursuit_avatar_url ?? null,
      fursuitSpeciesId: responseData.fursuit_species_id ?? null,
      fursuitSpeciesName: responseData.fursuit_species_name ?? null,
      photoUploadState: normalizeCatchPhotoUploadState(responseData.photo_upload_state),
      reciprocalOffer: normalizeReciprocalOffer(responseData.reciprocal_offer),
      edgeRequestMs,
    };

    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle timeout/abort
    if (error instanceof Error && error.name === 'AbortError') {
      edgeRequestMs = roundMs(now() - edgeRequestStartedAt);
      captureFeatureError(new Error('Create catch request timed out'), {
        scope: 'catch-confirmations.createCatch',
        action: 'timeout',
        clientAttemptId,
        fursuitId: params.fursuitId,
        timeoutMs: effectiveTimeoutMs,
        edgeRequestMs,
      });
      throw withCatchPerformanceError(
        new Error('The request took too long. Please check your connection and try again.'),
        { result: 'timeout', edgeRequestMs },
      );
    }

    // Re-throw other errors
    throw error;
  }
}

export async function createReciprocalCatchOffer(params: {
  primaryCatchId: string;
  offeredFursuitId: string;
}): Promise<ReciprocalCatchOfferResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const supabaseKey = SUPABASE_ANON_KEY;

  if (!accessToken) {
    throw new Error('You must be signed in to offer a back-tag.');
  }

  const supabaseUrl = SUPABASE_URL;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration not set.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EDGE_FUNCTION_TIMEOUT_MS);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/create-reciprocal-catch-offer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        primary_catch_id: params.primaryCatchId,
        offered_fursuit_id: params.offeredFursuitId,
      }),
      signal: controller.signal,
    });

    const responseData = await response.json();

    if (!response.ok) {
      const errorMessage = responseData?.error;
      if (typeof errorMessage === 'string' && errorMessage.includes('back-tag')) {
        throw new Error(errorMessage);
      }

      throw new Error("We couldn't offer that back-tag. Please try again.");
    }

    return (
      normalizeReciprocalOffer(responseData.reciprocal_offer) ?? {
        offerId: null,
        status: 'FAILED',
        reciprocalCatchId: null,
        failureReason: null,
        eventEnqueued: false,
        offeredFursuitId: params.offeredFursuitId,
      }
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The request took too long. Please check your connection and try again.');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Attach a photo URL to an existing catch via the Edge Function (uses service role).
 * Called after the photo has been successfully uploaded to storage.
 */
export async function updateCatchPhoto(
  catchId: string,
  params: { photoPath: string; photoUrl?: string | null; photoSource?: CatchPhotoSource },
): Promise<UpdateCatchPhotoResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const supabaseKey = SUPABASE_ANON_KEY;

  if (!accessToken) {
    throw new Error('You must be signed in to update a catch.');
  }

  const supabaseUrl = SUPABASE_URL;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration not set.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EDGE_FUNCTION_TIMEOUT_MS);

  try {
    const resolvedPhotoUrl =
      params.photoUrl ?? buildAuthenticatedStorageObjectUrl(CATCH_PHOTO_BUCKET, params.photoPath);
    const requestBody: {
      catch_id: string;
      catch_photo_path: string;
      catch_photo_url: string;
      catch_photo_source?: CatchPhotoSource;
      photo_upload_state: 'uploaded';
    } = {
      catch_id: catchId,
      catch_photo_path: params.photoPath,
      catch_photo_url: resolvedPhotoUrl,
      photo_upload_state: 'uploaded',
    };

    if (params.photoSource) {
      requestBody.catch_photo_source = params.photoSource;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/create-catch`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const responseData = await response.json().catch(() => null);
      const errorMessage =
        typeof responseData?.error === 'string' && responseData.error.trim()
          ? responseData.error
          : 'Failed to attach photo to catch.';
      throw new Error(errorMessage);
    }

    const responseData = await response.json().catch(() => null);

    const photoUploadState = normalizeCatchPhotoUploadState(responseData?.photo_upload_state);

    return {
      photoUploadState: photoUploadState === 'failed' ? 'failed' : 'uploaded',
      alreadyUploaded: responseData?.already_uploaded === true,
      photoPath: stringField(responseData?.catch_photo_path) ?? params.photoPath,
      photoUrl: stringField(responseData?.catch_photo_url) ?? resolvedPhotoUrl,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The request took too long. Please check your connection and try again.');
    }

    throw error;
  }
}

export async function markCatchPhotoUploadFailed(
  catchId: string,
): Promise<MarkCatchPhotoUploadFailedResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const supabaseKey = SUPABASE_ANON_KEY;

  if (!accessToken) {
    throw new Error('You must be signed in to update a catch.');
  }

  const supabaseUrl = SUPABASE_URL;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration not set.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EDGE_FUNCTION_TIMEOUT_MS);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/create-catch`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        catch_id: catchId,
        photo_upload_state: 'failed',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const responseText = await response.text().catch(() => null);
      captureSupabaseError(new Error('Failed to mark photo upload failed.'), {
        scope: 'catch-confirmations.markCatchPhotoUploadFailed',
        action: 'edge-function',
        catchId,
        statusCode: response.status,
        responseBody: responseText,
      });
      throw new Error('Failed to mark photo upload failed.');
    }

    const responseData = await response.json().catch(() => null);
    const storedPaths =
      typeof responseData?.stored_paths === 'object' && responseData.stored_paths !== null
        ? (responseData.stored_paths as Record<string, unknown>)
        : null;
    const photoPath =
      stringField(responseData?.catch_photo_path) ??
      stringField(storedPaths?.catch_photo_path) ??
      stringField(storedPaths?.photo_path);
    const photoUrl =
      stringField(responseData?.catch_photo_url) ??
      stringField(storedPaths?.catch_photo_url) ??
      stringField(storedPaths?.photo_url);
    const photoUploadState =
      responseData?.already_uploaded === true ||
      Boolean(photoPath || photoUrl) ||
      normalizeCatchPhotoUploadState(responseData?.photo_upload_state) === 'uploaded'
        ? 'uploaded'
        : 'failed';

    return {
      photoUploadState,
      alreadyUploaded: responseData?.already_uploaded === true,
      photoPath,
      photoUrl,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The request took too long. Please check your connection and try again.');
    }

    if (isSupabaseError(error)) {
      captureSupabaseError(error, {
        scope: 'catch-confirmations.markCatchPhotoUploadFailed',
        action: 'edge-function',
        catchId,
      });
    } else {
      captureHandledException(error, {
        scope: 'catch-confirmations.markCatchPhotoUploadFailed',
        level: 'error',
        additionalContext: {
          function: 'markCatchPhotoUploadFailed',
          catchId,
        },
      });
    }

    throw error;
  }
}

export async function uploadCatchPhotoFromUri(params: {
  userId: string;
  localPhotoUri: string;
}): Promise<{ photoPath: string; photoUrl: string }> {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const photoPath = `${params.userId}/${uniqueSuffix}.jpg`;

  try {
    const fileBytes = await loadUriAsUint8Array(params.localPhotoUri);

    const { error: uploadError } = await supabase.storage
      .from(CATCH_PHOTO_BUCKET)
      .upload(photoPath, fileBytes, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      captureSupabaseError(uploadError, {
        scope: 'catch-confirmations.uploadCatchPhotoFromUri',
        action: 'storage.upload',
        additionalContext: {
          function: 'uploadCatchPhotoFromUri',
          userId: params.userId,
          photoPath,
          bucket: CATCH_PHOTO_BUCKET,
        },
      });
      throw uploadError;
    }

    return {
      photoPath,
      photoUrl: buildAuthenticatedStorageObjectUrl(CATCH_PHOTO_BUCKET, photoPath),
    };
  } catch (error) {
    if (!isSupabaseError(error)) {
      captureHandledException(error, {
        scope: 'catch-confirmations.uploadCatchPhotoFromUri',
        additionalContext: {
          function: 'uploadCatchPhotoFromUri',
          userId: params.userId,
          photoPath,
        },
      });
    }

    throw error;
  }
}

export type FursuitPickerItem = {
  id: string;
  name: string;
  avatarUrl: string | null;
  species: string | null;
};

export type ReciprocalFursuitPickerItem = FursuitPickerItem & {
  conventionIds: string[];
};

type ConventionRosterFursuitRow =
  Database['public']['Functions']['get_convention_suit_roster']['Returns'][number];

async function fetchConventionFursuitsForConvention(
  conventionId: string,
  signal?: AbortSignal,
): Promise<ConventionRosterFursuitRow[]> {
  const client = supabase as SupabaseClient<Database>;
  let query = client.rpc('get_convention_suit_roster', {
    p_convention_id: conventionId,
  });

  if (signal) {
    query = query.abortSignal(signal);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

/**
 * Fetch fursuits attending any of the given conventions, excluding the user's own fursuits.
 * Used to populate the fursuit picker in the photo catch flow.
 */
export async function fetchConventionFursuits(
  conventionIds: string[],
  excludeOwnerId: string,
  signal?: AbortSignal,
): Promise<FursuitPickerItem[]> {
  if (conventionIds.length === 0) {
    return [];
  }

  let rows: Awaited<ReturnType<typeof fetchConventionFursuitPickerRoster>>;
  try {
    rows = await fetchConventionFursuitPickerRoster(conventionIds, signal);
  } catch {
    throw new Error("We couldn't load fursuits for your conventions. Please try again.");
  }

  const seen = new Set<string>();
  const results: FursuitPickerItem[] = [];

  for (const row of rows) {
    if (row.ownerProfileId === excludeOwnerId) continue;
    if (seen.has(row.fursuitId)) continue;
    seen.add(row.fursuitId);
    results.push({
      id: row.fursuitId,
      name: row.name,
      avatarUrl: row.avatarUrl,
      species: row.species,
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchOwnedConventionFursuits(
  conventionIds: string[],
  ownerId: string,
): Promise<ReciprocalFursuitPickerItem[]> {
  if (conventionIds.length === 0) {
    return [];
  }

  let rows: ConventionRosterFursuitRow[];
  try {
    rows = (
      await Promise.all(
        conventionIds.map((conventionId) => fetchConventionFursuitsForConvention(conventionId)),
      )
    ).flat();
  } catch {
    throw new Error("We couldn't load your fursuits for back-tags. Please try again.");
  }

  const byId = new Map<string, ReciprocalFursuitPickerItem>();

  for (const row of rows) {
    if (!row.fursuit_id || row.owner_id !== ownerId || !row.convention_id) continue;

    const existing = byId.get(row.fursuit_id);
    if (existing) {
      if (!existing.conventionIds.includes(row.convention_id)) {
        existing.conventionIds.push(row.convention_id);
      }
      continue;
    }

    byId.set(row.fursuit_id, {
      id: row.fursuit_id,
      name: row.fursuit_name ?? 'Unknown suit',
      avatarUrl: resolveStorageMediaUrl({
        bucket: FURSUIT_BUCKET,
        path: row.fursuit_avatar_path ?? null,
        legacyUrl: row.fursuit_avatar_url ?? null,
      }),
      species: row.species_name ?? null,
      conventionIds: [row.convention_id],
    });
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
