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
 * Send notification to a user about an expired catch
 */
async function sendExpiredNotification(
  userId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    type: "catch_expired",
    payload,
  });

  if (error) {
    console.error(
      `[expire-pending-catches] Failed to send notification to ${userId}:`,
      error
    );
  }
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
 * Process a single expired catch - send notifications to both parties
 */
async function processExpiredCatch(catchData: ExpiredCatch): Promise<void> {
  const catcherUsername = catchData.catcher_username || "Someone";
  const fursuitName = catchData.fursuit_name || "a fursuit";

  // Send notification to catcher
  await sendExpiredNotification(catchData.catcher_id, {
    fursuit_name: fursuitName,
    catch_id: catchData.id,
  });

  // Send notification to fursuit owner
  await sendExpiredNotification(catchData.owner_id, {
    fursuit_name: fursuitName,
    catcher_username: catcherUsername,
    catch_id: catchData.id,
  });

  // Emit event for tracking/stats
  await emitExpiredEvent(catchData);

  console.log(
    `[expire-pending-catches] Processed expired catch ${catchData.id}: ${catcherUsername} -> ${fursuitName}`
  );
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

    // Process each expired catch (send notifications)
    const expiredCatches = result.expired_catches || [];
    let notificationsSent = 0;

    for (const catchData of expiredCatches) {
      try {
        await processExpiredCatch(catchData);
        notificationsSent += 2; // One for catcher, one for owner
      } catch (notifError) {
        console.error(
          `[expire-pending-catches] Error processing catch ${catchData.id}:`,
          notifError
        );
        // Continue processing other catches even if one fails
      }
    }

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
