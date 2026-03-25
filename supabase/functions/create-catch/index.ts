/// <reference lib="deno.unstable" />
/**
 * Supabase Edge Function: create-catch
 *
 * Handles catch creation with approval mode support.
 * Creates catches with appropriate status based on fursuit settings.
 */

// eslint-disable-next-line import/no-unresolved -- Deno edge functions import via remote URL
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import {
  ingestGameplayEvent,
  loadGameplayQueueConfig,
  scheduleGameplayQueueDrain,
} from "../_shared/gameplayQueue.ts";

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

const resolvedSupabaseUrl = supabaseUrl;
const resolvedSupabaseAnonKey = supabaseAnonKey;
const resolvedServiceRoleKey = serviceRoleKey;

const supabaseAdmin = createClient(resolvedSupabaseUrl, resolvedServiceRoleKey, {
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

  const supabaseUserClient = createClient(resolvedSupabaseUrl, resolvedSupabaseAnonKey, {
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
    // Check if catcher and fursuit owner have blocked each other
    const { data: fursuitRow } = await supabaseAdmin
      .from('fursuits')
      .select('owner_id')
      .eq('id', body.fursuit_id)
      .single();

    if (fursuitRow?.owner_id) {
      const { data: blocked } = await supabaseAdmin.rpc('is_blocked', {
        p_user_a: userId,
        p_user_b: fursuitRow.owner_id,
      });

      if (blocked === true) {
        return jsonResponse(403, { error: "Cannot catch this fursuit" });
      }
    }

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
      const fursuitPromise = (async () => await supabaseAdmin
        .from('fursuits')
        .select('name, species:fursuit_species(name)')
        .eq('id', body.fursuit_id)
        .single())();
      const colorsPromise = (async () => await supabaseAdmin
        .from('fursuit_color_assignments')
        .select('color:fursuit_colors(name)')
        .eq('fursuit_id', body.fursuit_id)
        .order('position', { ascending: true }))();
      // For photo catches (force_pending = true), the notification is sent after the
      // photo URL is attached (PATCH handler), so we skip fetching catcher here.
      const catcherPromise = (result.requires_approval && !body.force_pending)
        ? (async () => await supabaseAdmin
            .from('profiles')
            .select('username')
            .eq('id', userId)
            .single())()
        : Promise.resolve(undefined);

      const [fursuitResult, colorsResult, catcherResult] = await Promise.all([
        fursuitPromise,
        colorsPromise,
        catcherPromise,
      ]);

      const speciesRow = Array.isArray(fursuitResult.data?.species)
        ? fursuitResult.data?.species[0]
        : fursuitResult.data?.species;

      speciesName = speciesRow?.name ?? null;
      colorNames = (colorsResult.data ?? [])
        .map((row) => {
          const colorRow = Array.isArray(row.color) ? row.color[0] : row.color;
          return colorRow?.name;
        })
        .filter((name): name is string => !!name);

      // Send approval notification for non-photo catches only.
      // Photo catches (force_pending = true) delay notification until after the photo URL
      // is attached in the PATCH handler, so the owner sees the photo immediately.
      if (result.requires_approval && !body.force_pending && fursuitResult.data && catcherResult?.data) {
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

    // Persist the canonical gameplay event before returning.
    const eventType = result.requires_approval ? 'catch_pending' : 'catch_performed';
    const ingestResult = await ingestGameplayEvent(supabaseAdmin, {
      type: eventType,
      userId,
      conventionId: body.convention_id ?? null,
      payload: {
        catch_id: result.catch_id,
        fursuit_id: body.fursuit_id,
        convention_id: body.convention_id ?? null,
        is_tutorial: body.is_tutorial ?? false,
        status: result.status,
        species: speciesName,
        colors: colorNames,
      },
      occurredAt: new Date().toISOString(),
      idempotencyKey: `catch:${result.catch_id}:${eventType}`,
    });

    if (ingestResult.enqueued && !ingestResult.duplicate) {
      const queueConfig = await loadGameplayQueueConfig(supabaseAdmin);
      if (queueConfig.queueEnabled && queueConfig.wakeupEnabled) {
        scheduleGameplayQueueDrain({
          supabaseUrl: resolvedSupabaseUrl,
          serviceRoleKey: resolvedServiceRoleKey,
          maxMessages: queueConfig.wakeupMaxMessages,
          maxDurationMs: queueConfig.wakeupMaxDurationMs,
        });
      }
    }

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

  // Now that the photo URL is attached, notify the fursuit owner.
  // We do this here (not in POST) so the owner sees the photo immediately on their card.
  try {
    const { data: catchCtx, error: catchCtxError } = await supabaseAdmin
      .from('catches')
      .select(
        'catcher_id, fursuit_id, fursuits!catches_fursuit_id_fkey(owner_id, name), profiles!catches_catcher_id_fkey(username)',
      )
      .eq('id', body.catch_id)
      .single();

    if (catchCtxError) {
      throw catchCtxError;
    }

    if (catchCtx) {
      const fursuit = Array.isArray(catchCtx.fursuits) ? catchCtx.fursuits[0] : catchCtx.fursuits;
      const profile = Array.isArray(catchCtx.profiles) ? catchCtx.profiles[0] : catchCtx.profiles;

      const { error: notifError } = await supabaseAdmin.rpc('notify_catch_pending', {
        p_catch_id: body.catch_id,
        p_fursuit_owner_id: (fursuit as { owner_id: string } | null)?.owner_id,
        p_catcher_id: catchCtx.catcher_id,
        p_fursuit_name: (fursuit as { name: string } | null)?.name ?? 'Unknown Fursuit',
        p_catcher_username: (profile as { username: string } | null)?.username ?? 'Someone',
      });

      if (notifError) {
        console.error("[create-catch] Failed to send photo catch notification:", notifError);
      }
    }
  } catch (notifError) {
    console.error("[create-catch] Error sending photo catch notification:", notifError);
    // Don't fail the response — the photo was attached successfully
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
