/// <reference lib="deno.unstable" />
/**
 * Supabase Edge Function: create-catch
 *
 * Handles catch creation with approval mode support.
 * Creates catches with appropriate status based on fursuit settings.
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

interface CreateCatchRequest {
  fursuit_id: string;
  convention_id?: string | null;
  is_tutorial?: boolean;
}

interface CreateCatchResponse {
  catch_id: string;
  status: string;
  expires_at: string | null;
  catch_number: number | null;
  requires_approval: boolean;
  fursuit_owner_id: string;
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

async function getUserIdFromRequest(req: Request): Promise<string | null> {
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
  if (error || !data.user) return null;

  return data.user.id;
}

async function handlePost(req: Request): Promise<Response> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  let body: CreateCatchRequest;
  try {
    body = await req.json() as CreateCatchRequest;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON payload" });
  }

  if (!body.fursuit_id) {
    return jsonResponse(400, { error: "Missing fursuit_id" });
  }

  try {
    // Call the create_catch_with_approval function
    const { data, error } = await supabaseAdmin.rpc('create_catch_with_approval', {
      p_fursuit_id: body.fursuit_id,
      p_catcher_id: userId,
      p_convention_id: body.convention_id || null,
      p_is_tutorial: body.is_tutorial || false,
    });

    if (error) {
      // Handle specific error cases
      if (error.message?.includes("Cannot catch your own fursuit")) {
        return jsonResponse(400, { error: "Cannot catch your own fursuit" });
      }
      if (error.message?.includes("already caught")) {
        return jsonResponse(400, { error: "Fursuit already caught or pending" });
      }
      if (error.message?.includes("not found")) {
        return jsonResponse(404, { error: "Fursuit not found" });
      }

      console.error("[create-catch] RPC error:", error);
      return jsonResponse(500, { error: "Failed to create catch" });
    }

    const result = data as CreateCatchResponse;

    // If the catch requires approval, send notification to fursuit owner
    // This is done in a try/catch to ensure notification failures don't fail the catch
    if (result.requires_approval) {
      try {
        // Get fursuit and catcher details for notification
        const [fursuitData, catcherData] = await Promise.all([
          supabaseAdmin
            .from('fursuits')
            .select('name')
            .eq('id', body.fursuit_id)
            .single(),
          supabaseAdmin
            .from('profiles')
            .select('username')
            .eq('id', userId)
            .single(),
        ]);

        if (fursuitData.data && catcherData.data) {
          // Send notification to fursuit owner
          const { error: notifError } = await supabaseAdmin.rpc('notify_catch_pending', {
            p_catch_id: result.catch_id,
            p_fursuit_owner_id: result.fursuit_owner_id,
            p_catcher_id: userId,
            p_fursuit_name: fursuitData.data.name,
            p_catcher_username: catcherData.data.username || 'Someone',
          });

          if (notifError) {
            console.error("[create-catch] Failed to send notification:", notifError);
            // Don't fail the catch creation if notification fails
          }
        }
      } catch (notifError) {
        console.error("[create-catch] Notification error:", notifError);
        // Don't fail the catch creation if notification fails
      }
    }

    // Fire the catch_performed event if accepted, or catch_pending if requires approval
    const eventType = result.requires_approval ? 'catch_pending' : 'catch_performed';

    // Fire event asynchronously (don't await)
    fetch(`${supabaseUrl}/functions/v1/events-ingress`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: eventType,
        user_id: userId, // Required for service role requests
        convention_id: body.convention_id,
        payload: {
          catch_id: result.catch_id,
          fursuit_id: body.fursuit_id,
          convention_id: body.convention_id,
          is_tutorial: body.is_tutorial,
          status: result.status,
        },
      }),
    }).catch((eventError) => {
      console.error("[create-catch] Failed to emit event:", eventError);
      // Don't fail the catch creation if event emission fails
    });

    return jsonResponse(201, result);
  } catch (error) {
    console.error("[create-catch] Unexpected error:", error);
    return jsonResponse(500, { error: "Internal server error" });
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