/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- Edge functions import via remote URL
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY");

if (!supabaseUrl || !serviceRoleKey || !supabaseAnonKey) {
  throw new Error("Missing Supabase configuration for sync-provider-avatar");
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const AVATAR_BUCKET = "avatars";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const FALLBACK_CONTENT_TYPE = "image/jpeg";

type SyncPayload = {
  sourceUrl?: string;
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

const isHttpUrl = (value: string | undefined) => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

const cleanContentType = (value: string | null) => value?.split(";")[0]?.trim().toLowerCase() ?? null;

const inferContentTypeFromUrl = (url: string) => {
  const normalized = url.split("?")[0]?.toLowerCase() ?? "";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
};

const inferExtension = (contentType: string | null, url: string) => {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("gif")) return "gif";
  if (contentType?.includes("bmp")) return "bmp";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";

  const normalized = url.split("?")[0]?.toLowerCase() ?? "";
  if (normalized.endsWith(".png")) return "png";
  if (normalized.endsWith(".webp")) return "webp";
  if (normalized.endsWith(".gif")) return "gif";
  if (normalized.endsWith(".bmp")) return "bmp";
  return "jpg";
};

const deriveStoragePathFromPublicUrl = (publicUrl: string | null | undefined) => {
  if (!publicUrl) return null;
  try {
    const url = new URL(publicUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const bucketIndex = segments.findIndex((segment) => segment === AVATAR_BUCKET);
    if (bucketIndex === -1) {
      return null;
    }
    return segments.slice(bucketIndex + 1).join("/");
  } catch {
    return null;
  }
};

async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const supabaseUserClient = createClient(supabaseUrl!, supabaseAnonKey!, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const { data, error } = await supabaseUserClient.auth.getUser();
  if (error || !data.user) {
    return null;
  }

  return data.user;
}

async function handlePost(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  let payload: SyncPayload;
  try {
    payload = (await req.json()) as SyncPayload;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON payload" });
  }

  const sourceUrl = payload.sourceUrl?.trim();
  if (!isHttpUrl(sourceUrl)) {
    return jsonResponse(400, { error: "A valid sourceUrl is required" });
  }

  try {
    const response = await fetch(sourceUrl!);
    if (!response.ok) {
      return jsonResponse(502, { error: `Unable to download avatar (status ${response.status})` });
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (bytes.byteLength === 0) {
      return jsonResponse(500, { error: "Avatar response was empty" });
    }

    if (bytes.byteLength > MAX_IMAGE_SIZE) {
      return jsonResponse(400, { error: "Avatar exceeds the 5MB file size limit" });
    }

    const headerType = cleanContentType(response.headers.get("content-type"));
    const contentType = headerType ?? inferContentTypeFromUrl(sourceUrl!);
    const extension = inferExtension(headerType, sourceUrl!);
    const storagePath = `${user.id}/provider-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(AVATAR_BUCKET)
      .upload(storagePath, bytes, {
        contentType: contentType ?? FALLBACK_CONTENT_TYPE,
        upsert: true,
      });

    if (uploadError) {
      console.error("[sync-provider-avatar] Upload error", uploadError);
      return jsonResponse(500, { error: "Failed to store avatar" });
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);

    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    const existingPath = deriveStoragePathFromPublicUrl(profileData?.avatar_url);
    if (existingPath && existingPath !== storagePath) {
      await supabaseAdmin.storage.from(AVATAR_BUCKET).remove([existingPath]).catch((error) => {
        console.error('[sync-provider-avatar] Failed to remove old avatar', error);
      });
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        avatar_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileError) {
      console.error("[sync-provider-avatar] Profile update error", profileError);
      return jsonResponse(500, { error: "Failed to update profile avatar" });
    }

    return jsonResponse(200, { avatarUrl: publicUrl });
  } catch (error) {
    console.error("[sync-provider-avatar] Unexpected error", error);
    return jsonResponse(500, { error: "Failed to sync avatar" });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  return handlePost(req);
});
