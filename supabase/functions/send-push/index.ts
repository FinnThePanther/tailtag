/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions use remote imports.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN") ?? null;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SERVICE_ROLE_KEY environment variables");
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const SUPPORTED_TYPES = new Set([
  "achievement_awarded",
  "catch_pending",
  "catch_confirmed",
  "catch_rejected",
  "catch_expired",
  "daily_all_complete",
]);

type NotificationRecord = {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type WebhookPayload = {
  type: string;
  table: string;
  schema: string;
  record: NotificationRecord;
};

type ExpoPushResponse = {
  data?: {
    status?: string;
    message?: string;
    details?: { error?: string };
  } | Array<{
    status?: string;
    message?: string;
    details?: { error?: string };
  }>;
  errors?: Array<{ code?: string; message?: string }>;
};

function respondJson(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function extractString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

async function resolveAchievementName(payload: Record<string, unknown>): Promise<string> {
  const existing = extractString(payload.achievement_name);
  if (existing) {
    return existing;
  }

  const achievementId = extractString(payload.achievement_id);
  if (achievementId) {
    const { data, error } = await supabaseAdmin
      .from("achievements")
      .select("name")
      .eq("id", achievementId)
      .maybeSingle();
    if (!error && data?.name) {
      payload.achievement_name = data.name;
      return data.name;
    }
  }

  const achievementKey = extractString(payload.achievement_key);
  if (achievementKey) {
    const { data, error } = await supabaseAdmin
      .from("achievements")
      .select("name")
      .eq("key", achievementKey)
      .maybeSingle();
    if (!error && data?.name) {
      payload.achievement_name = data.name;
      return data.name;
    }
  }

  return achievementKey ?? "achievement";
}

async function buildMessage(
  type: string,
  payload: Record<string, unknown>,
): Promise<{ title: string; body: string } | null> {
  switch (type) {
    case "achievement_awarded": {
      const achievementName = await resolveAchievementName(payload);
      return {
        title: "Achievement Unlocked!",
        body: `You earned: ${achievementName}`,
      };
    }
    case "catch_pending": {
      const catcherUsername = extractString(payload.catcher_username) ?? "Someone";
      const fursuitName = extractString(payload.fursuit_name) ?? "your fursuit";
      return {
        title: "Catch Request",
        body: `${catcherUsername} wants to catch ${fursuitName}`,
      };
    }
    case "catch_confirmed": {
      const fursuitName = extractString(payload.fursuit_name) ?? "a fursuit";
      return {
        title: "Catch Approved!",
        body: `Your catch of ${fursuitName} was approved!`,
      };
    }
    case "catch_rejected": {
      const fursuitName = extractString(payload.fursuit_name) ?? "a fursuit";
      return {
        title: "Catch Declined",
        body: `Your request for ${fursuitName} was declined`,
      };
    }
    case "catch_expired": {
      const fursuitName = extractString(payload.fursuit_name) ?? "a fursuit";
      const catcherUsername = extractString(payload.catcher_username);
      if (catcherUsername) {
        return {
          title: "Catch Request Expired",
          body: `${catcherUsername}'s request for ${fursuitName} expired`,
        };
      }
      return {
        title: "Catch Expired",
        body: `Your request for ${fursuitName} expired`,
      };
    }
    case "daily_all_complete":
      return {
        title: "All Tasks Complete!",
        body: "Great job finishing today's tasks!",
      };
    default:
      return null;
  }
}

async function clearPushToken(userId: string) {
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      expo_push_token: null,
      push_notifications_enabled: false,
    })
    .eq("id", userId);

  if (error) {
    console.error("[send-push] Failed clearing invalid token", { userId, error });
  }
}

function extractExpoErrors(responseJson: ExpoPushResponse): string[] {
  const results = responseJson?.data;
  const entries = Array.isArray(results) ? results : results ? [results] : [];
  const errors: string[] = [];

  for (const entry of entries) {
    if (entry?.status === "error") {
      const code = entry?.details?.error;
      if (code) {
        errors.push(code);
      }
    }
  }

  return errors;
}

async function handleRequest(req: Request): Promise<Response> {
  let parsed: WebhookPayload;
  try {
    parsed = (await req.json()) as WebhookPayload;
  } catch {
    return respondJson({ error: "Invalid JSON payload" }, 400);
  }

  const record = parsed?.record;
  if (!record || typeof record !== "object") {
    return respondJson({ skipped: "Missing record" }, 200);
  }

  const notificationType = extractString(record.type);
  if (!notificationType) {
    return respondJson({ skipped: "Missing notification type" }, 200);
  }

  if (notificationType === "daily_task_completed" || notificationType === "daily_reset") {
    return respondJson({ skipped: "Unsupported type" }, 200);
  }

  if (!SUPPORTED_TYPES.has(notificationType)) {
    return respondJson({ skipped: "Unhandled type" }, 200);
  }

  const userId = extractString(record.user_id);
  if (!userId) {
    return respondJson({ skipped: "Missing user_id" }, 200);
  }

  const payload = toRecord(record.payload);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("expo_push_token, push_notifications_enabled")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("[send-push] Failed fetching profile", { userId, error: profileError });
    return respondJson({ skipped: "Profile fetch failed" }, 200);
  }

  if (!profile?.push_notifications_enabled || !profile?.expo_push_token) {
    return respondJson({ skipped: "Push disabled or missing token" }, 200);
  }

  const message = await buildMessage(notificationType, payload);
  if (!message) {
    return respondJson({ skipped: "No message template" }, 200);
  }

  const requestBody = {
    to: profile.expo_push_token,
    title: message.title,
    body: message.body,
    data: {
      ...payload,
      type: notificationType,
      notification_id: record.id,
    },
    sound: "default",
    priority: "default",
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (expoAccessToken) {
    headers.Authorization = `Bearer ${expoAccessToken}`;
  }

  let responseJson: ExpoPushResponse | null = null;

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    try {
      responseJson = (await response.json()) as ExpoPushResponse;
    } catch (parseError) {
      console.error("[send-push] Failed parsing Expo response", { parseError });
    }

    if (!response.ok) {
      console.error("[send-push] Expo push failed", {
        status: response.status,
        response: responseJson,
      });
    }
  } catch (error) {
    console.error("[send-push] Expo push request failed", { error });
    return respondJson({ error: "Expo request failed" }, 200);
  }

  if (responseJson) {
    const expoErrors = extractExpoErrors(responseJson);
    if (expoErrors.includes("DeviceNotRegistered")) {
      await clearPushToken(userId);
    } else if (expoErrors.length > 0) {
      console.error("[send-push] Expo errors", { expoErrors, response: responseJson });
    }
  }

  return respondJson({ success: true }, 200);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respondJson({ error: "Method not allowed" }, 405);
  }

  // Verify the request is authenticated with service role
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return respondJson({ error: "Missing authorization" }, 401);
  }

  const token = authHeader.substring(7);

  // Verify the JWT is valid and get the role
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    // Token is invalid or expired
    return respondJson({ error: "Invalid or expired token" }, 401);
  }

  // Check if the token has service_role privileges
  // Service role tokens have a specific role claim
  try {
    // Decode the JWT to check the role claim
    const parts = token.split(".");
    if (parts.length !== 3) {
      return respondJson({ error: "Invalid token format" }, 401);
    }

    const payload = JSON.parse(atob(parts[1]));
    const role = payload?.role;

    // Only allow service_role tokens (used by database triggers and server-side code)
    if (role !== "service_role") {
      return respondJson({ error: "Insufficient permissions" }, 403);
    }
  } catch {
    return respondJson({ error: "Invalid token" }, 401);
  }

  return handleRequest(req);
});
