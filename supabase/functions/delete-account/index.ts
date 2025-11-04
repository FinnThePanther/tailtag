/// <reference lib="deno.unstable" />
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

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function decodeJwt(token: string): { sub?: string } {
  try {
    const payload = token.split(".")[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

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

  // Get token and extract user ID
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "No token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.substring(7);
  const { sub: userId } = decodeJwt(token);

  if (!userId) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[delete-account] Deleting user ${userId}`);

  try {
    // STEP 1: Delete notifications first (has NO ACTION constraint)
    console.log("[delete-account] Deleting notifications");
    await supabase.from("notifications").delete().eq("user_id", userId);

    // STEP 2: Delete other user data
    console.log("[delete-account] Deleting user data");
    await supabase.from("user_achievements").delete().eq("user_id", userId);
    await supabase.from("user_daily_progress").delete().eq("user_id", userId);
    await supabase.from("user_daily_streaks").delete().eq("user_id", userId);
    await supabase.from("profile_conventions").delete().eq("profile_id", userId);
    await supabase.from("catches").delete().eq("catcher_id", userId);

    // STEP 3: Delete fursuits and related data
    console.log("[delete-account] Deleting fursuits");
    const { data: fursuits } = await supabase
      .from("fursuits")
      .select("id")
      .eq("owner_id", userId);

    if (fursuits && fursuits.length > 0) {
      const fursuitIds = fursuits.map((f) => f.id);
      await supabase.from("fursuit_conventions").delete().in("fursuit_id", fursuitIds);
      await supabase.from("fursuit_bios").delete().in("fursuit_id", fursuitIds);
      await supabase.from("catches").delete().in("fursuit_id", fursuitIds);
    }

    await supabase.from("fursuits").delete().eq("owner_id", userId);

    // STEP 4: Delete profile
    console.log("[delete-account] Deleting profile");
    await supabase.from("profiles").delete().eq("id", userId);

    // STEP 5: Delete auth user LAST
    console.log("[delete-account] Deleting auth user");
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) {
      console.error("[delete-account] Auth deletion failed:", authError);
      throw new Error(`Auth deletion failed: ${authError.message}`);
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
