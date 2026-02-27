import { supabase } from '../../../lib/supabase';
import { captureFeatureError } from '../../../lib/sentry';
import type { CatchMode, PendingCatch, ConfirmCatchResult, CreateCatchResult, CreateCatchParams } from '../types';

// Query keys
export const PENDING_CATCHES_QUERY_KEY = 'pending-catches';

export const pendingCatchesQueryKey = (userId: string) =>
  [PENDING_CATCHES_QUERY_KEY, userId] as const;

// Stale times
export const PENDING_CATCHES_STALE_TIME = 15 * 1000; // 15 seconds

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
    fursuitId: row.fursuit_id,
    fursuitName: row.fursuit_name ?? 'Unknown Fursuit',
    fursuitAvatarUrl: row.fursuit_avatar_url ?? null,
    conventionId: row.convention_id,
    conventionName: row.convention_name ?? 'Unknown Convention',
    caughtAt: row.caught_at,
    expiresAt: row.expires_at,
    timeRemaining: String(row.time_remaining ?? ''),
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
  _conventionId?: string // No longer needed - server-side emission handles this
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

  // Event emission now happens server-side in the confirm_catch RPC function
  // This eliminates the 401 auth error that occurred with client-side emission

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

  if (!accessToken) {
    throw new Error('You must be signed in to catch fursuits.');
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured.');
  }

  // Create AbortController for 5-second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/create-catch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fursuit_id: params.fursuitId,
        convention_id: params.conventionId,
        is_tutorial: params.isTutorial ?? false,
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
      if (errorMessage.includes('Cannot catch your own')) {
        throw new Error('That tag belongs to one of your own suits. Trade codes with friends to grow your collection.');
      }
      if (errorMessage.includes('already caught') || errorMessage.includes('pending')) {
        throw new Error('You already caught this suit. Swap codes with another fursuiter to keep hunting.');
      }
      if (errorMessage.includes('not found')) {
        throw new Error("We couldn't find a fursuit with that code. Double-check the letters and try again.");
      }

      throw new Error("We couldn't save that catch. Please try again.");
    }

    return {
      catchId: responseData.catch_id,
      status: responseData.status,
      expiresAt: responseData.expires_at ?? null,
      catchNumber: responseData.catch_number ?? null,
      requiresApproval: responseData.requires_approval ?? false,
      fursuitOwnerId: responseData.fursuit_owner_id,
    };
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
