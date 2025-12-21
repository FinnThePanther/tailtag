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
const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const DISCORD_CDN = "cdn.discordapp.com";
const DISCORD_TARGET_SIZE = 1024;
const GOOGLE_TARGET_SIZE = 512;

type SyncPayload = {
  sourceUrl?: string;
  provider?: string;
  accessToken?: string;
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

/**
 * SSRF protection: blocked hostnames and IP patterns.
 * Prevents requests to internal/private network endpoints.
 */
const BLOCKED_HOSTNAME_PATTERNS = [
  // Localhost variants
  /^localhost$/i,
  /^localhost\.localdomain$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,  // 127.0.0.0/8 loopback
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,  // IPv6 loopback
  /^\[?::\]?$/,   // IPv6 unspecified

  // Private IPv4 ranges
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,           // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/,  // 172.16.0.0/12
  /^192\.168\.\d{1,3}\.\d{1,3}$/,              // 192.168.0.0/16
  /^169\.254\.\d{1,3}\.\d{1,3}$/,              // 169.254.0.0/16 link-local

  // Cloud metadata endpoints
  /^metadata\.google\.internal$/i,
  /^metadata\.google\.internal\.$/i,
  /^169\.254\.169\.254$/,  // AWS/GCP/Azure metadata
  /^100\.100\.100\.200$/,  // Alibaba metadata
  /^fd00:ec2::254$/i,      // AWS IMDSv2 IPv6

  // Internal/reserved hostnames
  /^.*\.internal$/i,
  /^.*\.local$/i,
  /^.*\.localdomain$/i,
  /^internal\..*/i,
  /^kubernetes\.default/i,
  /^.*\.svc\.cluster\.local$/i,

  // IPv6 private/internal ranges (simplified patterns)
  /^\[?fe80:/i,  // Link-local
  /^\[?fc00:/i,  // Unique local
  /^\[?fd[0-9a-f]{2}:/i,  // Unique local
];

/**
 * Checks if a hostname or IP is in a private/internal range.
 */
const isBlockedHostname = (hostname: string): boolean => {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(normalizedHostname));
};

/**
 * Checks if an IP address string falls within private/internal ranges.
 */
const isPrivateIP = (ip: string): boolean => {
  // Check against our blocked patterns which include private IP ranges
  return isBlockedHostname(ip);
};

/**
 * Combined SSRF-safe URL validation.
 * Checks protocol, hostname, and optionally resolved IP.
 */
const isSafeUrl = async (value: string | undefined): Promise<{ safe: boolean; reason?: string }> => {
  if (!value) return { safe: false, reason: "URL is empty" };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { safe: false, reason: "Invalid URL format" };
  }

  // Protocol check
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { safe: false, reason: "URL must use http or https protocol" };
  }

  // Hostname blocklist check
  if (isBlockedHostname(parsed.hostname)) {
    return { safe: false, reason: "URL hostname is blocked (private/internal address)" };
  }

  // Attempt DNS resolution to catch hostnames that resolve to private IPs
  // This is optional and depends on Deno.resolveDns availability
  try {
    if (typeof Deno !== "undefined" && typeof Deno.resolveDns === "function") {
      // Only resolve if hostname is not already an IP address
      const ipv4Pattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
      if (!ipv4Pattern.test(parsed.hostname) && !parsed.hostname.startsWith("[")) {
        const ips = await Deno.resolveDns(parsed.hostname, "A").catch(() => [] as string[]);
        for (const ip of ips) {
          if (isPrivateIP(ip)) {
            return { safe: false, reason: `URL hostname resolves to private IP: ${ip}` };
          }
        }
      }
    }
  } catch {
    // DNS resolution failed or not available; proceed with hostname check only
  }

  return { safe: true };
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

  const provider = typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : null;

  let payload: SyncPayload;
  try {
    payload = (await req.json()) as SyncPayload;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON payload" });
  }

  const normalizeSourceUrl = (provider: string | null, url: string | undefined | null) => {
    if (!url) return url ?? null;
    try {
      const parsed = new URL(url);
      if (provider === "google" && parsed.hostname.endsWith("googleusercontent.com")) {
        parsed.pathname = parsed.pathname.replace(/=s\d+-c$/i, "");
        parsed.searchParams.set("sz", String(GOOGLE_TARGET_SIZE));
        return parsed.toString();
      }

      if (provider === "discord" && parsed.hostname === DISCORD_CDN) {
        parsed.searchParams.set("size", String(DISCORD_TARGET_SIZE));
        return parsed.toString();
      }
    } catch {
      return url;
    }

    return url;
  };

  let sourceUrl = normalizeSourceUrl(provider, payload.sourceUrl?.trim());
  const initialUrlCheck = await isSafeUrl(sourceUrl);
  if (!initialUrlCheck.safe) {
    if (provider === "google" && (!sourceUrl || initialUrlCheck.reason === "URL is empty")) {
      const accessToken = payload.accessToken?.trim();
      if (!accessToken) {
        return jsonResponse(400, { error: "accessToken is required for Google sync" });
      }

      try {
        const googleResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!googleResponse.ok) {
          console.error("[sync-provider-avatar] Google userinfo error", await googleResponse.text());
          return jsonResponse(502, { error: "Unable to fetch Google profile photo" });
        }

        const googleProfile: { picture?: string } = await googleResponse.json();

        const googlePictureCheck = await isSafeUrl(googleProfile.picture);
        if (googlePictureCheck.safe) {
          sourceUrl = normalizeSourceUrl(provider, googleProfile.picture!);
        } else {
          return jsonResponse(400, { error: googlePictureCheck.reason?.includes("blocked") ? googlePictureCheck.reason : "Google account does not provide a profile photo" });
        }
      } catch (error) {
        console.error("[sync-provider-avatar] Failed to fetch Google userinfo", error);
        return jsonResponse(502, { error: "Unable to fetch Google profile data" });
      }
    } else {
      return jsonResponse(400, { error: initialUrlCheck.reason?.includes("blocked") ? initialUrlCheck.reason : "A valid sourceUrl is required" });
    }
  }

  // Final SSRF check before fetching (sourceUrl may have changed)
  const finalUrlCheck = await isSafeUrl(sourceUrl);
  if (!finalUrlCheck.safe) {
    return jsonResponse(400, { error: finalUrlCheck.reason ?? "URL is not allowed" });
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
    const storagePath = `${user.id}/provider-avatar.${extension}`;

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
