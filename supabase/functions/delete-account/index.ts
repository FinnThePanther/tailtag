/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- remote import for Deno edge functions
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SERVICE_ROLE_KEY environment variables");
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");

  if (!header) {
    return null;
  }

  const parts = header.split(" ");

  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }

  return parts[1];
}

function deriveStoragePathFromPublicUrl(publicUrl: string | null | undefined, bucketName: string): string | null {
  if (!publicUrl) {
    return null;
  }

  try {
    const url = new URL(publicUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const bucketIndex = segments.findIndex((segment) => segment === bucketName);

    if (bucketIndex === -1) {
      return null;
    }

    const objectSegments = segments.slice(bucketIndex + 1);
    return objectSegments.join("/");
  } catch (error) {
    console.warn("[delete-account] Unable to parse storage URL", error);
    return null;
  }
}

async function assertSuccess(promise: Promise<{ error: { message?: string } | null }>, context: string) {
  const { error } = await promise;

  if (error) {
    throw new Error(`Failed to delete ${context}: ${error.message ?? "unknown error"}`);
  }
}

async function deleteAccountData(userId: string) {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (profileError && profileError.code !== "PGRST116") {
    throw new Error(`Unable to load profile: ${profileError.message}`);
  }

  const profileAvatarPath = deriveStoragePathFromPublicUrl(profile?.avatar_url ?? null, "avatars");

  const { data: fursuits, error: fursuitsError } = await supabaseAdmin
    .from("fursuits")
    .select("id, avatar_url")
    .eq("owner_id", userId);

  if (fursuitsError) {
    throw new Error(`Unable to load fursuits: ${fursuitsError.message}`);
  }

  const fursuitIds = (fursuits ?? []).map((record) => record.id);
  const fursuitAvatarPaths = (fursuits ?? [])
    .map((record) => deriveStoragePathFromPublicUrl(record.avatar_url ?? null, "fursuit-avatars"))
    .filter((path): path is string => Boolean(path));

  if (profileAvatarPath) {
    const { error: storageError } = await supabaseAdmin.storage
      .from("avatars")
      .remove([profileAvatarPath]);

    if (storageError) {
      throw new Error(`Unable to delete profile avatar: ${storageError.message}`);
    }
  }

  if (fursuitAvatarPaths.length > 0) {
    const { error: storageError } = await supabaseAdmin.storage
      .from("fursuit-avatars")
      .remove(fursuitAvatarPaths);

    if (storageError) {
      throw new Error(`Unable to delete fursuit photos: ${storageError.message}`);
    }
  }

  await assertSuccess(
    supabaseAdmin
      .from("achievement_notifications")
      .delete()
      .eq("user_id", userId),
    "achievement notifications",
  );

  await assertSuccess(
    supabaseAdmin
      .from("user_achievements")
      .delete()
      .eq("user_id", userId),
    "user achievements",
  );

  await assertSuccess(
    supabaseAdmin
      .from("user_daily_progress")
      .delete()
      .eq("user_id", userId),
    "daily progress",
  );

  await assertSuccess(
    supabaseAdmin
      .from("user_daily_streaks")
      .delete()
      .eq("user_id", userId),
    "daily streaks",
  );

  await assertSuccess(
    supabaseAdmin
      .from("profile_conventions")
      .delete()
      .eq("profile_id", userId),
    "profile conventions",
  );

  await assertSuccess(
    supabaseAdmin
      .from("catches")
      .delete()
      .eq("catcher_id", userId),
    "catches recorded as catcher",
  );

  if (fursuitIds.length > 0) {
    await assertSuccess(
      supabaseAdmin
        .from("fursuit_conventions")
        .delete()
        .in("fursuit_id", fursuitIds),
      "fursuit conventions",
    );

    await assertSuccess(
      supabaseAdmin
        .from("fursuit_bios")
        .delete()
        .in("fursuit_id", fursuitIds),
      "fursuit bios",
    );

    await assertSuccess(
      supabaseAdmin
        .from("catches")
        .delete()
        .in("fursuit_id", fursuitIds),
      "catches recorded for owned fursuits",
    );
  }

  await assertSuccess(
    supabaseAdmin
      .from("fursuits")
      .delete()
      .eq("owner_id", userId),
    "fursuits",
  );

  const {
    data: remainingFursuits,
    error: remainingFursuitsError,
  } = await supabaseAdmin
    .from("fursuits")
    .select("id, avatar_url")
    .eq("owner_id", userId);

  if (remainingFursuitsError) {
    throw new Error(`Unable to verify fursuit deletion: ${remainingFursuitsError.message}`);
  }

  if ((remainingFursuits?.length ?? 0) > 0) {
    const remainingAvatarPaths = remainingFursuits
      .map((record) => deriveStoragePathFromPublicUrl(record.avatar_url ?? null, "fursuit-avatars"))
      .filter((path): path is string => Boolean(path));

    if (remainingAvatarPaths.length > 0) {
      const { error: remainingStorageError } = await supabaseAdmin.storage
        .from("fursuit-avatars")
        .remove(remainingAvatarPaths);

      if (remainingStorageError) {
        throw new Error(`Unable to delete remaining fursuit photos: ${remainingStorageError.message}`);
      }
    }

    await assertSuccess(
      supabaseAdmin
        .from("fursuits")
        .delete()
        .eq("owner_id", userId),
      "fursuits (final cleanup)",
    );
  }

  await assertSuccess(
    supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", userId),
    "profile",
  );

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (authError) {
    throw new Error(`Unable to delete auth user: ${authError.message}`);
  }

  return {
    userId,
    fursuitsDeleted: fursuitIds.length,
    fursuitAvatarsDeleted: fursuitAvatarPaths.length,
    profileAvatarDeleted: Boolean(profileAvatarPath),
  } as const;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const accessToken = getBearerToken(req);

  if (!accessToken) {
    return jsonResponse(401, { error: "Missing or invalid authorization header" });
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !user) {
    return jsonResponse(401, { error: userError?.message ?? "Unauthorized" });
  }

  try {
    const summary = await deleteAccountData(user.id);
    return jsonResponse(200, { success: true, summary });
  } catch (error) {
    console.error("[delete-account] Failed deleting account", error);
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error",
    });
  }
});
