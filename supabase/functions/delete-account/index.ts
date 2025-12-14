/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const AVATAR_BUCKET = "avatars";
const FURSUIT_BUCKET = "fursuit-avatars";
const TAG_QR_BUCKET = "tag-qr-codes";

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

  const removeUserBucketFolder = async (
    bucketId: string,
    prefix: string,
    label: string,
  ) => {
    const pageSize = 100;
    try {
      while (true) {
        const { data, error } = await supabaseAdmin.storage
          .from(bucketId)
          .list(prefix, { limit: pageSize });

        if (error) {
          console.error(
            `[delete-account] Failed to list ${label} objects`,
            error,
          );
          break;
        }

        if (!data || data.length === 0) {
          break;
        }

        const paths = data
          .filter((item) => Boolean(item.name))
          .map((item) => `${prefix}/${item.name}`);

        if (paths.length === 0) {
          break;
        }

        const { error: removeError } = await supabaseAdmin.storage
          .from(bucketId)
          .remove(paths);

        if (removeError) {
          console.error(
            `[delete-account] Failed to remove ${label} objects`,
            removeError,
          );
          break;
        }

        if (data.length < pageSize) {
          break;
        }
      }
    } catch (error) {
      console.error(
        `[delete-account] Unexpected error removing ${label} objects`,
        error,
      );
    }
  };

  const chunkArray = <T,>(input: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let index = 0; index < input.length; index += size) {
      chunks.push(input.slice(index, index + size));
    }
    return chunks;
  };

  const removeQrAssetsForUser = async (userId: string) => {
    const { data, error } = await supabaseAdmin
      .from("tags")
      .select("qr_asset_path")
      .eq("registered_by_user_id", userId)
      .not("qr_asset_path", "is", null);

    if (error) {
      console.error("[delete-account] Failed to look up QR assets", error);
      return;
    }

    const uniquePaths = Array.from(
      new Set(
        (data ?? [])
          .map((row) => row.qr_asset_path)
          .filter((path): path is string =>
            typeof path === "string" && path.length > 0
          ),
      ),
    );

    for (const chunk of chunkArray(uniquePaths, 100)) {
      const { error: removalError } = await supabaseAdmin.storage
        .from(TAG_QR_BUCKET)
        .remove(chunk);

      if (removalError) {
        console.error(
          "[delete-account] Failed to remove QR asset chunk",
          removalError,
        );
        break;
      }
    }
  };

  try {
    console.log("[delete-account] Removing stored assets");
    await removeUserBucketFolder(AVATAR_BUCKET, userId, "profile avatars");
    await removeUserBucketFolder(FURSUIT_BUCKET, userId, "fursuit photos");
    await removeQrAssetsForUser(userId);

    // STEP 1: Handle special case - preserve catches on other users' fursuits
    // SET NULL for decided_by_user_id (these catches belong to other users)
    // The foreign key constraint uses SET NULL, but we do it explicitly for clarity
    console.log("[delete-account] Nullifying decided_by references");
    await supabaseAdmin
      .from("catches")
      .update({ decided_by_user_id: null })
      .eq("decided_by_user_id", userId);

    // STEP 2: Delete auth user - CASCADE constraints handle all related data
    // This will automatically cascade delete:
    //   - profiles (CASCADE) →
    //       - fursuits (CASCADE) → fursuit_conventions, fursuit_bios, catches [by fursuit_id]
    //       - catches [by catcher_id] (CASCADE)
    //       - profile_conventions (CASCADE)
    //   - notifications (CASCADE)
    //   - events (CASCADE)
    //   - user_achievements (CASCADE)
    //   - user_daily_progress (CASCADE)
    //   - user_daily_streaks (CASCADE)
    console.log("[delete-account] Deleting auth user (cascade will handle all related data)");
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
