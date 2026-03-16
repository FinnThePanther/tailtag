/// <reference lib="deno.unstable" />
/**
 * Supabase Edge Function: staff-moderate
 *
 * Allows staff/moderator/organizer/owner to apply moderation actions
 * (ban, warn, mute) from the mobile app's Staff Mode.
 */

// eslint-disable-next-line import/no-unresolved -- Deno edge functions import via remote URL
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY");
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  throw new Error("Missing Supabase configuration");
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const ALLOWED_ROLES = ["staff", "moderator", "organizer", "owner"];

type ModerateAction = "ban" | "warn" | "mute";

interface ModerateRequest {
  action: ModerateAction;
  userId: string;
  reason: string;
  durationHours?: number | null;
  scope?: "global" | "event";
  conventionId?: string | null;
}

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function getCallerInfo(req: Request): Promise<{ id: string; role: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const supabaseUserClient = createClient(supabaseUrl!, supabaseAnonKey!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await supabaseUserClient.auth.getUser();
  if (error || !data.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (!profile) return null;

  return { id: data.user.id, role: profile.role };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const caller = await getCallerInfo(req);
  if (!caller) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  if (!ALLOWED_ROLES.includes(caller.role)) {
    return jsonResponse(403, { error: "Insufficient permissions" });
  }

  let body: ModerateRequest;
  try {
    body = await req.json() as ModerateRequest;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON payload" });
  }

  if (!body.action || !body.userId || !body.reason) {
    return jsonResponse(400, { error: "Missing required fields: action, userId, reason" });
  }

  if (!["ban", "warn", "mute"].includes(body.action)) {
    return jsonResponse(400, { error: "Invalid action. Must be ban, warn, or mute" });
  }

  const scope = body.scope ?? "global";
  const expiresAt =
    body.durationHours && body.durationHours > 0
      ? new Date(Date.now() + body.durationHours * 60 * 60 * 1000).toISOString()
      : null;

  try {
    // Insert moderation action
    const actionType = body.action === "warn" ? "warning" : body.action;
    const { error: insertError } = await supabaseAdmin
      .from("user_moderation_actions")
      .insert({
        user_id: body.userId,
        action_type: actionType,
        scope,
        convention_id: scope === "event" ? body.conventionId ?? null : null,
        reason: body.reason,
        duration_hours: body.durationHours ?? null,
        expires_at: expiresAt,
        is_active: body.action !== "warn", // Warnings are not "active" in the same sense
        applied_by_user_id: caller.id,
      });

    if (insertError) {
      console.error("[staff-moderate] Insert error:", insertError);
      return jsonResponse(500, { error: "Failed to apply moderation action" });
    }

    // For bans, also update the profile suspension status
    if (body.action === "ban") {
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({
          is_suspended: true,
          suspended_until: expiresAt,
          suspension_reason: body.reason || "Banned",
        })
        .eq("id", body.userId);

      if (updateError) {
        console.error("[staff-moderate] Profile update error:", updateError);
      }
    }

    // Write to audit log
    const { error: auditError } = await supabaseAdmin
      .from("audit_log")
      .insert({
        actor_id: caller.id,
        action: `${body.action}_user`,
        entity_type: "profile",
        entity_id: body.userId,
        context: {
          reason: body.reason,
          scope,
          convention_id: body.conventionId ?? null,
          duration_hours: body.durationHours ?? null,
          source: "staff_mode",
        },
      });

    if (auditError) {
      console.error("[staff-moderate] Audit log error:", auditError);
      // Don't fail the request if audit logging fails
    }

    return jsonResponse(200, { success: true, action: body.action });
  } catch (error) {
    console.error("[staff-moderate] Unexpected error:", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
