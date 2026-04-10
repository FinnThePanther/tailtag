import { supabase } from '../../../lib/supabase';
import { captureFeatureError } from '../../../lib/sentry';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../../lib/runtimeConfig';
import {
  emitImmediateAchievementAwards,
  type ImmediateAchievementAward,
} from '../../achievements/immediateAwardsBus';
import { emitLocalGameplayEvent } from '../../events/localGameplayEventsBus';
import type { Json } from '../../../types/database';
import type { CatchMode, PendingCatch, ConfirmCatchResult, CreateCatchResult, CreateCatchParams } from '../types';

// Query keys
export const PENDING_CATCHES_QUERY_KEY = 'pending-catches';

export const pendingCatchesQueryKey = (userId: string) =>
  [PENDING_CATCHES_QUERY_KEY, userId] as const;

// Stale times
export const PENDING_CATCHES_STALE_TIME = 15 * 1000; // 15 seconds

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeInlineAwards(raw: unknown): ImmediateAchievementAward[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const awards: ImmediateAchievementAward[] = [];

  for (const entry of raw) {
    if (!isRecord(entry)) {
      continue;
    }

    if (entry.awarded === false) {
      continue;
    }

    const achievementKey =
      typeof entry.achievement_key === 'string' && entry.achievement_key.length > 0
        ? entry.achievement_key
        : null;

    if (!achievementKey) {
      continue;
    }

    awards.push({
      achievementId:
        typeof entry.achievement_id === 'string' && entry.achievement_id.length > 0
          ? entry.achievement_id
          : null,
      achievementKey,
      awardedAt:
        typeof entry.awarded_at === 'string' && entry.awarded_at.length > 0
          ? entry.awarded_at
          : null,
      context: isRecord(entry.context) ? (entry.context as Json) : null,
      sourceEventId:
        typeof entry.source_event_id === 'string' && entry.source_event_id.length > 0
          ? entry.source_event_id
          : null,
    });
  }

  return awards;
}

function normalizeColorNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
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
    catcherAvatarUrl: row.catcher_avatar_url ?? null,
    fursuitId: row.fursuit_id,
    fursuitName: row.fursuit_name ?? 'Unknown Fursuit',
    fursuitAvatarUrl: row.fursuit_avatar_url ?? null,
    conventionId: row.convention_id,
    conventionName: row.convention_name ?? 'Unknown Convention',
    caughtAt: row.caught_at,
    expiresAt: row.expires_at,
    timeRemaining: String(row.time_remaining ?? ''),
    catchPhotoUrl: row.catch_photo_url ?? null,
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
  conventionId?: string
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
        : "We couldn't decline this catch. Please try again."
    );
  }

  const result = data as { success: boolean; message?: string } | null;

  if (!result?.success) {
    throw new Error(result?.message ?? 'Failed to process catch decision.');
  }

  if (decision === 'accept' && conventionId) {
    const occurredAt = new Date().toISOString();
    const rpcRow = isRecord(data) ? data : null;
    const optimisticPayload: Record<string, Json> = {
      catch_id: catchId,
      convention_id: conventionId,
      source: 'catch_confirmed',
      status: 'ACCEPTED',
      fursuit_id:
        typeof rpcRow?.fursuit_id === 'string' && rpcRow.fursuit_id.length > 0
          ? rpcRow.fursuit_id
          : null,
      catcher_id:
        typeof rpcRow?.catcher_id === 'string' && rpcRow.catcher_id.length > 0
          ? rpcRow.catcher_id
          : null,
    };

    emitLocalGameplayEvent({
      eventId: `catch:${catchId}:confirmed:local`,
      idempotencyKey: `catch:${catchId}:confirmed:${occurredAt}`,
      type: 'catch_performed',
      conventionId,
      occurredAt,
      payload: ({ ...optimisticPayload, payload: optimisticPayload } as Json),
      emittedAt: Date.now(),
    });
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
 * Update fursuit catch mode
 */
export async function updateFursuitCatchMode(
  fursuitId: string,
  userId: string,
  catchMode: CatchMode
): Promise<void> {
  const client = supabase as any;

  const { error } = await client
    .from('fursuits')
    .update({ catch_mode: catchMode })
    .eq('id', fursuitId)
    .eq('owner_id', userId);

  if (error) {
    throw new Error("We couldn't update the catch mode. Please try again.");
  }
}

/**
 * Create a catch via the Edge Function.
 * Handles auto-accept vs manual approval based on fursuit settings.
 */
export async function createCatch(params: CreateCatchParams): Promise<CreateCatchResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const currentUserId = sessionData.session?.user.id ?? null;
  const supabaseKey = SUPABASE_ANON_KEY;

  if (!accessToken) {
    throw new Error('You must be signed in to catch fursuits.');
  }

  const supabaseUrl = SUPABASE_URL;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration not set.');
  }

  // Create AbortController for 5-second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/create-catch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        apikey: supabaseKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fursuit_id: params.fursuitId,
        convention_id: params.conventionId,
        is_tutorial: params.isTutorial ?? false,
        force_pending: params.forcePending ?? false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseData = await response.json();

    if (!response.ok) {
      const errorMessage = responseData?.error ?? 'Failed to create catch';

      captureFeatureError(new Error(errorMessage), {
        scope: 'catch-confirmations.createCatch',
        action: 'edge-function',
        fursuitId: params.fursuitId,
        statusCode: response.status,
      });

      // Return user-friendly messages for known errors
      if (response.status === 403) {
        throw new Error('You cannot catch this fursuit.');
      }
      if (errorMessage.includes('Cannot catch your own')) {
        throw new Error('That tag belongs to one of your own suits. Trade codes with friends to grow your collection.');
      }
      if (errorMessage.includes('already caught') || errorMessage.includes('pending')) {
        throw new Error('You already caught this suit at this convention. Try catching them at another con!');
      }
      if (errorMessage.includes('not found')) {
        throw new Error("We couldn't find a fursuit with that code. Double-check the letters and try again.");
      }

      throw new Error("We couldn't save that catch. Please try again.");
    }

    const result: CreateCatchResult = {
      catchId: responseData.catch_id,
      status: responseData.status,
      expiresAt: responseData.expires_at ?? null,
      catchNumber: responseData.catch_number ?? null,
      requiresApproval: responseData.requires_approval ?? false,
      fursuitOwnerId: responseData.fursuit_owner_id,
    };

    const immediateAwards = normalizeInlineAwards(responseData?.awards);
    if (currentUserId && immediateAwards.length > 0) {
      emitImmediateAchievementAwards({
        userId: currentUserId,
        awards: immediateAwards,
      });
    }

    if (!result.requiresApproval && params.conventionId) {
      const occurredAt = new Date().toISOString();
      const colorNames = normalizeColorNames(responseData?.colors);
      const optimisticPayload: Record<string, Json> = {
        catch_id: result.catchId,
        catcher_id: currentUserId,
        fursuit_id: params.fursuitId,
        convention_id: params.conventionId,
        status: result.status,
        is_tutorial: params.isTutorial ?? false,
        species: typeof responseData?.species === 'string' ? responseData.species : null,
        colors: colorNames,
      };

      emitLocalGameplayEvent({
        eventId:
          typeof responseData?.event_id === 'string' && responseData.event_id.length > 0
            ? responseData.event_id
            : `catch:${result.catchId}:local`,
        idempotencyKey: `catch:${result.catchId}:${occurredAt}`,
        type: 'catch_performed',
        conventionId: params.conventionId,
        occurredAt,
        payload: ({ ...optimisticPayload, payload: optimisticPayload } as Json),
        emittedAt: Date.now(),
      });

      void wakeGameplayQueue().catch((queueWakeError) => {
        captureFeatureError(queueWakeError, {
          scope: 'catch-confirmations.createCatch',
          action: 'wakeGameplayQueue',
          catchId: result.catchId,
        });
      });
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle timeout/abort
    if (error instanceof Error && error.name === 'AbortError') {
      captureFeatureError(new Error('Create catch request timed out after 5 seconds'), {
        scope: 'catch-confirmations.createCatch',
        action: 'timeout',
        fursuitId: params.fursuitId,
      });
      throw new Error('The request took too long. Please check your connection and try again.');
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Attach a photo URL to an existing catch via the Edge Function (uses service role).
 * Called after the photo has been successfully uploaded to storage.
 */
export async function updateCatchPhoto(catchId: string, photoUrl: string): Promise<void> {
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
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/create-catch`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        apikey: supabaseKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ catch_id: catchId, catch_photo_url: photoUrl }),
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
      avatarUrl: f.avatar_url ?? null,
      species: f.species_entry?.name ?? null,
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}
