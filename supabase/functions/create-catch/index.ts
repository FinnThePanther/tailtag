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
  force_pending?: boolean;
}

interface UpdateCatchPhotoRequest {
  catch_id: string;
  catch_photo_url: string;
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
      p_force_pending: body.force_pending || false,
    });

    if (error) {
      // Handle specific error cases
      if (error.message?.includes("Cannot catch your own fursuit")) {
        return jsonResponse(400, { error: "Cannot catch your own fursuit" });
      }
      if (error.message?.includes("already caught")) {
        return jsonResponse(400, { error: "Fursuit already caught at this convention" });
      }
      if (error.message?.includes("not found")) {
        return jsonResponse(404, { error: "Fursuit not found" });
      }

      console.error("[create-catch] RPC error:", error);
      return jsonResponse(500, { error: "Failed to create catch" });
    }

    const result = data as CreateCatchResponse;

    // Fetch fursuit metadata (species + colors) for enriching the event payload.
    // Also fetch fursuit name + catcher username for notifications if approval is needed.
    // These run in parallel so we don't add latency.
    let speciesName: string | null = null;
    let colorNames: string[] = [];

    try {
      const metadataPromises: Promise<unknown>[] = [
        supabaseAdmin
          .from('fursuits')
          .select('name, species:fursuit_species(name)')
          .eq('id', body.fursuit_id)
          .single(),
        supabaseAdmin
          .from('fursuit_color_assignments')
          .select('color:fursuit_colors(name)')
          .eq('fursuit_id', body.fursuit_id)
          .order('position', { ascending: true }),
      ];

      if (result.requires_approval) {
        metadataPromises.push(
          supabaseAdmin
            .from('profiles')
            .select('username')
            .eq('id', userId)
            .single(),
        );
      }

      const results = await Promise.all(metadataPromises);

      const fursuitResult = results[0] as { data: { name: string; species: { name: string } | null } | null };
      const colorsResult = results[1] as { data: { color: { name: string } | null }[] | null };
      const catcherResult = results[2] as { data: { username: string } | null } | undefined;

      speciesName = fursuitResult.data?.species?.name ?? null;
      colorNames = (colorsResult.data ?? [])
        .map((row) => row.color?.name)
        .filter((name): name is string => !!name);

      // Send approval notification if needed
      if (result.requires_approval && fursuitResult.data && catcherResult?.data) {
        const { error: notifError } = await supabaseAdmin.rpc('notify_catch_pending', {
          p_catch_id: result.catch_id,
          p_fursuit_owner_id: result.fursuit_owner_id,
          p_catcher_id: userId,
          p_fursuit_name: fursuitResult.data.name,
          p_catcher_username: catcherResult.data.username || 'Someone',
        });

        if (notifError) {
          console.error("[create-catch] Failed to send notification:", notifError);
        }
      }
    } catch (metadataError) {
      console.error("[create-catch] Metadata/notification error:", metadataError);
      // Don't fail the catch creation if metadata fetch fails
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
          species: speciesName,
          colors: colorNames,
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

async function handlePatch(req: Request): Promise<Response> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  let body: UpdateCatchPhotoRequest;
  try {
    body = await req.json() as UpdateCatchPhotoRequest;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON payload" });
  }

  if (!body.catch_id || !body.catch_photo_url) {
    return jsonResponse(400, { error: "Missing catch_id or catch_photo_url" });
  }

  // Verify the catch belongs to this user
  const { data: catchRow, error: fetchError } = await supabaseAdmin
    .from('catches')
    .select('id, catcher_id')
    .eq('id', body.catch_id)
    .single();

  if (fetchError || !catchRow) {
    return jsonResponse(404, { error: "Catch not found" });
  }

  if ((catchRow as { catcher_id: string }).catcher_id !== userId) {
    return jsonResponse(403, { error: "Forbidden" });
  }

  const { error: updateError } = await supabaseAdmin
    .from('catches')
    .update({ catch_photo_url: body.catch_photo_url })
    .eq('id', body.catch_id);

  if (updateError) {
    console.error("[create-catch] Failed to update catch photo:", updateError);
    return jsonResponse(500, { error: "Failed to update catch photo" });
  }

  return jsonResponse(200, { success: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "POST") {
    return handlePost(req);
  }

  if (req.method === "PATCH") {
    return handlePatch(req);
  }

  return jsonResponse(405, { error: "Method not allowed" });
});