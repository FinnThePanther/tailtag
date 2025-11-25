import { supabase } from '../../../lib/supabase';
import { captureSupabaseError, captureHandledException } from '../../../lib/sentry';
import type { CatchMode, PendingCatch, ConfirmCatchResult, CreateCatchResult, CreateCatchParams } from '../types';

// Query keys
export const PENDING_CATCHES_QUERY_KEY = 'pending-catches';
export const PENDING_CATCH_COUNT_QUERY_KEY = 'pending-catch-count';

export const pendingCatchesQueryKey = (userId: string) =>
  [PENDING_CATCHES_QUERY_KEY, userId] as const;

export const pendingCatchCountQueryKey = (userId: string) =>
  [PENDING_CATCH_COUNT_QUERY_KEY, userId] as const;

// Stale times
export const PENDING_CATCHES_STALE_TIME = 30 * 1000; // 30 seconds
export const PENDING_CATCH_COUNT_STALE_TIME = 30 * 1000; // 30 seconds

/**
 * Fetch all pending catches for the user's fursuits
 */
export async function fetchPendingCatches(userId: string): Promise<PendingCatch[]> {
  const { data, error } = await supabase.rpc('get_pending_catches', {
    p_user_id: userId,
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'catch-confirmations.fetchPendingCatches',
      action: 'rpc',
      userId,
    });
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
  }));
}

/**
 * Fetch count of pending catches for badge display
 */
export async function fetchPendingCatchCount(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_pending_catch_count', {
    p_user_id: userId,
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'catch-confirmations.fetchPendingCatchCount',
      action: 'rpc',
      userId,
    });
    return 0; // Graceful degradation - don't throw for badge count
  }

  return typeof data === 'number' ? data : 0;
}

/**
 * Confirm or reject a pending catch
 */
export async function confirmCatch(
  catchId: string,
  userId: string,
  decision: 'accept' | 'reject',
  reason?: string
): Promise<ConfirmCatchResult> {
  const { data, error } = await supabase.rpc('confirm_catch', {
    p_catch_id: catchId,
    p_user_id: userId,
    p_decision: decision,
    p_reason: reason,
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'catch-confirmations.confirmCatch',
      action: 'rpc',
      catchId,
      userId,
      decision,
    });
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
    captureSupabaseError(error, {
      scope: 'catch-confirmations.updateFursuitCatchMode',
      action: 'update',
      fursuitId,
      userId,
      catchMode,
    });
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
  });

  const responseData = await response.json();

  if (!response.ok) {
    const errorMessage = responseData?.error ?? 'Failed to create catch';

    captureHandledException(new Error(errorMessage), {
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
}
