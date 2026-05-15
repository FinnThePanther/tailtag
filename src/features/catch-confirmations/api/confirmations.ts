import { Platform } from 'react-native';

import { supabase } from '../../../lib/supabase';
import { captureFeatureError } from '../../../lib/sentry';
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
} from '@/features/catch-confirmations/types';

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
};

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
  },
): CreateCatchError {
  const enrichedError = error as CreateCatchError;
  enrichedError.catchPerformanceResult = options.result;
  enrichedError.edgeRequestMs = options.edgeRequestMs ?? null;
  return enrichedError;
}

function normalizeCatchPhotoSource(raw: unknown): CatchPhotoSource | null {
  return raw === 'camera' || raw === 'gallery' ? raw : null;
}

export function normalizeCatchPhotoUploadState(raw: unknown): CatchPhotoUploadState {
  return raw === 'pending_upload' || raw === 'uploaded' || raw === 'failed' ? raw : 'not_required';
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

  const result = data as { success: boolean; message?: string } | null;

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
        is_tutorial: params.isTutorial ?? false,
        force_pending: params.forcePending ?? false,
        has_photo:
          Boolean(params.hasPhoto) || Boolean(params.photoPath) || Boolean(params.photoUrl),
        catch_photo_path: params.photoPath ?? null,
        catch_photo_url: params.photoUrl ?? null,
        catch_photo_source: params.photoSource ?? null,
        photo_upload_state: params.photoUploadState ?? null,
      }),
      signal: controller.signal,
    });

    edgeRequestMs = roundMs(now() - edgeRequestStartedAt);
    clearTimeout(timeoutId);

    const responseData = await response.json();

    if (!response.ok) {
      const errorMessage = responseData?.error ?? 'Failed to create catch';

      captureFeatureError(new Error(errorMessage), {
        scope: 'catch-confirmations.createCatch',
        action: 'edge-function',
        clientAttemptId,
        fursuitId: params.fursuitId,
        statusCode: response.status,
        edgeRequestMs,
      });

      // Return user-friendly messages for known errors
      if (errorMessage.includes('Cannot catch your own')) {
        throw withCatchPerformanceError(
          new Error(
            'That tag belongs to one of your own suits. Trade codes with friends to grow your collection.',
          ),
          { result: 'failed', edgeRequestMs },
        );
      }
      if (errorMessage.includes('share a playable convention')) {
        throw withCatchPerformanceError(
          new Error(
            'This suit is not catchable at your playable convention yet. Both players must be Ready to catch for the same live event, and the fursuit owner must list that specific suit for the event.',
          ),
          { result: 'failed', edgeRequestMs },
        );
      }
      if (errorMessage.includes('not accepting gallery catches')) {
        throw withCatchPerformanceError(
          new Error(
            'This convention is no longer accepting gallery catches. Gallery catches can be submitted during the event and for three local days after it ends.',
          ),
          { result: 'failed', edgeRequestMs },
        );
      }
      if (errorMessage.includes('already caught') || errorMessage.includes('pending')) {
        throw withCatchPerformanceError(
          new Error(
            'You already caught this suit at this convention. Try catching them at another con!',
          ),
          { result: 'failed', edgeRequestMs },
        );
      }
      if (errorMessage.includes('not found')) {
        throw withCatchPerformanceError(
          new Error(
            "We couldn't find a fursuit with that code. Double-check the letters and try again.",
          ),
          { result: 'failed', edgeRequestMs },
        );
      }
      if (response.status === 403) {
        throw withCatchPerformanceError(new Error('You cannot catch this fursuit.'), {
          result: 'failed',
          edgeRequestMs,
        });
      }

      throw withCatchPerformanceError(new Error("We couldn't save that catch. Please try again."), {
        result: 'failed',
        edgeRequestMs,
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
      fursuitOwnerId: responseData.fursuit_owner_id,
      conventionId: responseData.convention_id ?? params.conventionId ?? null,
      fursuitId: responseData.fursuit_id ?? params.fursuitId,
      fursuitName: responseData.fursuit_name,
      fursuitAvatarPath: responseData.fursuit_avatar_path ?? null,
      fursuitAvatarUrl: responseData.fursuit_avatar_url ?? null,
      fursuitSpeciesId: responseData.fursuit_species_id ?? null,
      fursuitSpeciesName: responseData.fursuit_species_name ?? null,
      photoUploadState: normalizeCatchPhotoUploadState(responseData.photo_upload_state),
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

/**
 * Attach a photo URL to an existing catch via the Edge Function (uses service role).
 * Called after the photo has been successfully uploaded to storage.
 */
export async function updateCatchPhoto(
  catchId: string,
  params: { photoPath: string; photoUrl?: string | null; photoSource?: CatchPhotoSource },
): Promise<void> {
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
      throw new Error('Failed to attach photo to catch.');
    }
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The request took too long. Please check your connection and try again.');
    }

    throw error;
  }
}

export async function markCatchPhotoUploadFailed(catchId: string): Promise<void> {
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
      throw new Error('Failed to mark photo upload failed.');
    }
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The request took too long. Please check your connection and try again.');
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
  const fileBytes = await loadUriAsUint8Array(params.localPhotoUri);

  const { error: uploadError } = await supabase.storage
    .from(CATCH_PHOTO_BUCKET)
    .upload(photoPath, fileBytes, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  return {
    photoPath,
    photoUrl: buildAuthenticatedStorageObjectUrl(CATCH_PHOTO_BUCKET, photoPath),
  };
}

export type FursuitPickerItem = {
  id: string;
  name: string;
  avatarUrl: string | null;
  species: string | null;
};

/**
 * Fetch fursuits attending any of the given conventions, excluding the user's own fursuits.
 * Used to populate the fursuit picker in the photo catch flow.
 */
export async function fetchConventionFursuits(
  conventionIds: string[],
  excludeOwnerId: string,
): Promise<FursuitPickerItem[]> {
  if (conventionIds.length === 0) {
    return [];
  }

  const client = supabase as any;
  const { data, error } = await client
    .from('fursuit_conventions')
    .select(
      `
      fursuit:fursuits (
        id,
        name,
        avatar_path,
        avatar_url,
        owner_id,
        is_tutorial,
        species_entry:fursuit_species (
          name
        )
      )
    `,
    )
    .in('convention_id', conventionIds);

  if (error) {
    throw new Error("We couldn't load fursuits for your conventions. Please try again.");
  }

  const seen = new Set<string>();
  const results: FursuitPickerItem[] = [];

  for (const row of data ?? []) {
    const f = row.fursuit;
    if (!f) continue;
    if (f.is_tutorial) continue;
    if (f.owner_id === excludeOwnerId) continue;
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    results.push({
      id: f.id,
      name: f.name,
      avatarUrl: resolveStorageMediaUrl({
        bucket: FURSUIT_BUCKET,
        path: f.avatar_path ?? null,
        legacyUrl: f.avatar_url ?? null,
      }),
      species: f.species_entry?.name ?? null,
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}
