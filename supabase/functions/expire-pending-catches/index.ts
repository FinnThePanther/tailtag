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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL or SERVICE_ROLE_KEY environment variables"
  );
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
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Batch insert notifications for all expired catches
 */
async function batchInsertNotifications(
  notifications: Array<{ user_id: string; type: string; payload: Record<string, unknown> }>
): Promise<number> {
  if (notifications.length === 0) {
    return 0;
  }

  const { error, count } = await supabaseAdmin
    .from("notifications")
    .insert(notifications)
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error(
      `[expire-pending-catches] Failed to batch insert ${notifications.length} notifications:`,
      error
    );
    return 0;
  }

  return count ?? notifications.length;
}

/**
 * Emit catch_expired event to events-ingress for tracking
 */
async function emitExpiredEvent(catchData: ExpiredCatch): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/functions/v1/events-ingress`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "catch_expired",
        payload: {
          catch_id: catchData.id,
          fursuit_id: catchData.fursuit_id,
          catcher_id: catchData.catcher_id,
          owner_id: catchData.owner_id,
        },
      }),
    });
  } catch (error) {
    console.error(
      `[expire-pending-catches] Failed to emit event for catch ${catchData.id}:`,
      error
    );
  }
}

/**
 * Build notification objects for a single expired catch
 */
function buildNotificationsForExpiredCatch(catchData: ExpiredCatch) {
  const catcherUsername = catchData.catcher_username || "Someone";
  const fursuitName = catchData.fursuit_name || "a fursuit";

  return [
    {
      user_id: catchData.catcher_id,
      type: "catch_expired" as const,
      payload: {
        fursuit_name: fursuitName,
        catch_id: catchData.id,
      },
    },
    {
      user_id: catchData.owner_id,
      type: "catch_expired" as const,
      payload: {
        fursuit_name: fursuitName,
        catcher_username: catcherUsername,
        catch_id: catchData.id,
      },
    },
  ];
}

/**
 * Emit event for a single expired catch (fire-and-forget, non-blocking)
 */
function emitExpiredEventAsync(catchData: ExpiredCatch): void {
  // Fire and forget - don't block on event emission
  void emitExpiredEvent(catchData).catch((error) => {
    console.error(
      `[expire-pending-catches] Failed to emit event for catch ${catchData.id}:`,
      error
    );
  });
}

async function handleRequest(): Promise<Response> {
  try {
    // Call the expire_pending_catches RPC to expire catches and get details
    const { data, error } = await supabaseAdmin.rpc("expire_pending_catches");

    if (error) {
      console.error("[expire-pending-catches] RPC error:", error);
      return respondJson({ error: "Failed to expire catches" }, 500);
    }

    const result = data as ExpireResult;

    if (!result.success) {
      console.error("[expire-pending-catches] RPC returned failure:", result);
      return respondJson({ error: "Expire operation failed" }, 500);
    }

    // Process expired catches: batch notifications and emit events
    const expiredCatches = result.expired_catches || [];

    // Build all notifications for batch insert
    const allNotifications = expiredCatches.flatMap(buildNotificationsForExpiredCatch);

    // Batch insert all notifications at once
    const notificationsSent = await batchInsertNotifications(allNotifications);

    // Emit events asynchronously (fire-and-forget, non-blocking)
    expiredCatches.forEach((catchData) => {
      emitExpiredEventAsync(catchData);
      console.log(
        `[expire-pending-catches] Processed expired catch ${catchData.id}: ${catchData.catcher_username || "Someone"} -> ${catchData.fursuit_name || "a fursuit"}`
      );
    });

    console.log(
      `[expire-pending-catches] Completed: ${result.expired_count} catches expired, ${notificationsSent} notifications sent`
    );

    return respondJson({
      success: true,
      expired_count: result.expired_count,
      notifications_sent: notificationsSent,
      timestamp: result.timestamp,
    });
  } catch (error) {
    console.error("[expire-pending-catches] Unexpected error:", error);
    return respondJson(
      { error: (error as Error).message ?? "Unknown error" },
      500
    );
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Accept both GET and POST (cron jobs may use either)
  if (req.method !== "GET" && req.method !== "POST") {
    return respondJson({ error: "Method not allowed" }, 405);
  }

  return handleRequest();
});
