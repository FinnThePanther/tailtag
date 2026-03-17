/// <reference lib="deno.unstable" />
/**
 * Supabase Edge Function: expire-bans
 *
 * Scheduled cron job that auto-clears expired temporary bans:
 * 1. Clears is_suspended / suspended_until / suspension_reason on profiles
 * 2. Marks active user_moderation_actions rows as is_active = false
 * 3. Writes ban_expired entries to audit_log
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

function respondJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleRequest(): Promise<Response> {
  try {
    const { data, error } = await supabaseAdmin.rpc("expire_bans");

    if (error) {
      console.error("[expire-bans] RPC error:", error);
      return respondJson({ error: "Failed to expire bans" }, 500);
    }

    const result = data as { success: boolean; expired_count: number };

    if (!result.success) {
      console.error("[expire-bans] RPC returned failure:", result);
      return respondJson({ error: "Expire operation failed" }, 500);
    }

    console.log(`[expire-bans] Completed: ${result.expired_count} bans expired`);

    return respondJson({
      success: true,
      expired_count: result.expired_count,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[expire-bans] Unexpected error:", error);
    return respondJson(
      { error: (error as Error).message ?? "Unknown error" },
      500
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return respondJson({ error: "Method not allowed" }, 405);
  }

  return handleRequest();
});
