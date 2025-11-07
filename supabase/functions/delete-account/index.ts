/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing environment variables");
}

// Service role client for admin operations
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get token and verify it with Supabase Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "No token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.substring(7);

  // SECURITY FIX: Verify the token cryptographically using Supabase Auth
  // This ensures the token is valid and not forged
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    console.error("[delete-account] Token verification failed:", authError);
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = user.id;
  console.log(`[delete-account] Deleting user ${userId}`);

  try {
    // STEP 1: Delete notifications first (has NO ACTION constraint)
    console.log("[delete-account] Deleting notifications");
    await supabaseAdmin.from("notifications").delete().eq("user_id", userId);

    // STEP 2: Delete other user data
    console.log("[delete-account] Deleting user data");
    await supabaseAdmin.from("user_achievements").delete().eq("user_id", userId);
    await supabaseAdmin.from("user_daily_progress").delete().eq("user_id", userId);
    await supabaseAdmin.from("user_daily_streaks").delete().eq("user_id", userId);
    await supabaseAdmin.from("profile_conventions").delete().eq("profile_id", userId);
    await supabaseAdmin.from("catches").delete().eq("catcher_id", userId);

    // STEP 3: Delete fursuits and related data
    console.log("[delete-account] Deleting fursuits");
    const { data: fursuits } = await supabaseAdmin
      .from("fursuits")
      .select("id")
      .eq("owner_id", userId);

    if (fursuits && fursuits.length > 0) {
      const fursuitIds = fursuits.map((f) => f.id);
      await supabaseAdmin.from("fursuit_conventions").delete().in("fursuit_id", fursuitIds);
      await supabaseAdmin.from("fursuit_bios").delete().in("fursuit_id", fursuitIds);
      await supabaseAdmin.from("catches").delete().in("fursuit_id", fursuitIds);
    }

    await supabaseAdmin.from("fursuits").delete().eq("owner_id", userId);

    // STEP 4: Delete profile
    console.log("[delete-account] Deleting profile");
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    // STEP 5: Delete auth user LAST
    console.log("[delete-account] Deleting auth user");
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      console.error("[delete-account] Auth deletion failed:", deleteAuthError);
      throw new Error(`Auth deletion failed: ${deleteAuthError.message}`);
    }

    console.log("[delete-account] Deletion complete");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[delete-account] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Deletion failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
