/// <reference lib="deno.unstable" />
/**
 * Supabase Edge Function: expire-pending-catches
 *
 * Scheduled cron job (hourly) that:
 * 1. Expires pending catches past their expiration time
 * 2. Sends notifications to both catcher and fursuit owner
 * 3. Emits catch_expired events for tracking
 */

// eslint-disable-next-line import/no-unresolved -- Deno edge functions import via remote URL
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import { beginBackendWorkerRun, completeBackendWorkerRun } from '../_shared/backendWorkerRuns.ts';
import { ingestGameplayEvent } from '../_shared/gameplayQueue.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SERVICE_ROLE_KEY environment variables');
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface ExpiredCatch {
  id: string;
  catcher_id: string;
  fursuit_id: string;
  fursuit_name: string;
  owner_id: string;
  catcher_username: string | null;
  catcher_can_view_fursuit: boolean | null;
  owner_can_view_fursuit: boolean | null;
  owner_can_view_catcher: boolean | null;
}

interface ExpireResult {
  success: boolean;
  expired_count: number;
  expired_catches: ExpiredCatch[] | null;
  timestamp: string;
}

function respondJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Insert notifications for all expired catches through the catch-notification
 * dedupe RPC so retries and overlapping cron runs stay idempotent.
 */
async function insertCatchNotifications(
  notifications: { user_id: string; type: string; payload: Record<string, unknown> }[],
): Promise<number> {
  if (notifications.length === 0) {
    return 0;
  }

  const results = await Promise.allSettled(
    notifications.map((notification) =>
      supabaseAdmin.rpc('insert_catch_notification_once', {
        p_user_id: notification.user_id,
        p_type: notification.type,
        p_payload: notification.payload,
      }),
    ),
  );

  return results.reduce((count, result, index) => {
    if (result.status === 'fulfilled' && !result.value.error) {
      return count + 1;
    }

    const error =
      result.status === 'fulfilled'
        ? result.value.error
        : result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason));

    console.error('[expire-pending-catches] Failed inserting catch notification:', {
      notification: notifications[index],
      error,
    });

    return count;
  }, 0);
}

/**
 * Build notification objects for a single expired catch
 */
function buildNotificationsForExpiredCatch(catchData: ExpiredCatch) {
  const catcherCanViewFursuit = catchData.catcher_can_view_fursuit === true;
  const ownerCanViewFursuit = catchData.owner_can_view_fursuit === true;
  const ownerCanViewCatcher = catchData.owner_can_view_catcher === true;
  const fursuitName = catchData.fursuit_name || null;
  const catcherUsername = catchData.catcher_username || null;

  return [
    {
      user_id: catchData.catcher_id,
      type: 'catch_expired' as const,
      payload: {
        adult_boundary_checked: true,
        recipient_role: 'catcher',
        ...(catcherCanViewFursuit && fursuitName ? { fursuit_name: fursuitName } : {}),
        catch_id: catchData.id,
      },
    },
    {
      user_id: catchData.owner_id,
      type: 'catch_expired' as const,
      payload: {
        adult_boundary_checked: true,
        recipient_role: 'owner',
        ...(ownerCanViewFursuit && fursuitName ? { fursuit_name: fursuitName } : {}),
        ...(ownerCanViewCatcher && catcherUsername ? { catcher_username: catcherUsername } : {}),
        catch_id: catchData.id,
      },
    },
  ];
}

async function recordExpiredEvent(catchData: ExpiredCatch): Promise<void> {
  await ingestGameplayEvent(supabaseAdmin, {
    type: 'catch_expired',
    userId: catchData.catcher_id,
    payload: {
      catch_id: catchData.id,
      fursuit_id: catchData.fursuit_id,
      catcher_id: catchData.catcher_id,
      owner_id: catchData.owner_id,
    },
    occurredAt: new Date().toISOString(),
    idempotencyKey: `catch:${catchData.id}:expired`,
  });
}

function parseSource(req: Request): string {
  const url = new URL(req.url);
  return url.searchParams.get('source')?.trim() || 'cron';
}

async function handleRequest(req: Request): Promise<Response> {
  const source = parseSource(req);
  const workerRun = await beginBackendWorkerRun(supabaseAdmin, {
    workerName: 'pending_catch_expiration',
    source,
  });

  try {
    // Call the expire_pending_catches RPC to expire catches and get details
    const { data, error } = await supabaseAdmin.rpc('expire_pending_catches');

    if (error) {
      console.error('[expire-pending-catches] RPC error:', error);
      await completeBackendWorkerRun(supabaseAdmin, workerRun, {
        status: 'failed',
        counts: {
          expired_catches: 0,
          notifications_sent: 0,
          notifications_failed: 0,
          events_recorded: 0,
          events_failed: 0,
        },
        error,
      });
      return respondJson({ error: 'Failed to expire catches' }, 500);
    }

    const result = data as ExpireResult;

    if (!result.success) {
      console.error('[expire-pending-catches] RPC returned failure:', result);
      await completeBackendWorkerRun(supabaseAdmin, workerRun, {
        status: 'failed',
        counts: {
          expired_catches: result.expired_count ?? 0,
          notifications_sent: 0,
          notifications_failed: 0,
          events_recorded: 0,
          events_failed: 0,
        },
        error: result,
      });
      return respondJson({ error: 'Expire operation failed' }, 500);
    }

    // Process expired catches: batch notifications and emit events
    const expiredCatches = result.expired_catches || [];

    // Build all notifications for idempotent insert
    const allNotifications = expiredCatches.flatMap(buildNotificationsForExpiredCatch);

    const notificationsSent = await insertCatchNotifications(allNotifications);

    const ingestResults = await Promise.allSettled(
      expiredCatches.map(async (catchData) => {
        await recordExpiredEvent(catchData);
        console.log(
          `[expire-pending-catches] Processed expired catch ${catchData.id}: ${catchData.catcher_username || 'Someone'} -> ${catchData.fursuit_name || 'a fursuit'}`,
        );
      }),
    );

    const eventFailures = ingestResults.reduce((count, ingestResult, index) => {
      if (ingestResult.status === 'rejected') {
        const catchData = expiredCatches[index];
        console.error(
          `[expire-pending-catches] Failed to record event for catch ${catchData?.id}:`,
          ingestResult.reason,
        );
        return count + 1;
      }
      return count;
    }, 0);
    const eventSuccesses = ingestResults.length - eventFailures;
    const notificationFailures = allNotifications.length - notificationsSent;

    console.log(
      `[expire-pending-catches] Completed: ${result.expired_count} catches expired, ${notificationsSent} notifications sent`,
    );

    await completeBackendWorkerRun(supabaseAdmin, workerRun, {
      status: notificationFailures > 0 || eventFailures > 0 ? 'partial' : 'succeeded',
      counts: {
        expired_catches: result.expired_count,
        notifications_sent: notificationsSent,
        notifications_failed: notificationFailures,
        events_recorded: eventSuccesses,
        events_failed: eventFailures,
      },
      error:
        notificationFailures > 0 || eventFailures > 0
          ? `${notificationFailures} notification inserts and ${eventFailures} event writes failed`
          : null,
    });

    return respondJson({
      success: true,
      expired_count: result.expired_count,
      notifications_sent: notificationsSent,
      timestamp: result.timestamp,
    });
  } catch (error) {
    console.error('[expire-pending-catches] Unexpected error:', error);
    await completeBackendWorkerRun(supabaseAdmin, workerRun, {
      status: 'failed',
      counts: {
        expired_catches: 0,
        notifications_sent: 0,
        notifications_failed: 0,
        events_recorded: 0,
        events_failed: 0,
      },
      error,
    });
    return respondJson({ error: (error as Error).message ?? 'Unknown error' }, 500);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Accept both GET and POST (cron jobs may use either)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return respondJson({ error: 'Method not allowed' }, 405);
  }

  return handleRequest(req);
});
