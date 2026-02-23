/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions use remote esm.sh imports.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { processAchievementsForEvent } from "../events-ingress/achievements.ts";
import type { InsertableEventRow } from "../events-ingress/types.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey =
  Deno.env.get("SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing Supabase configuration (SUPABASE_URL / SERVICE_ROLE_KEY)",
  );
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const BATCH_SIZE = 50;

type UnprocessedEvent = {
  event_id: string;
  user_id: string;
  convention_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  received_at: string;
  retry_count: number;
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

function isServiceRoleAuth(req: Request): boolean {
  const header =
    req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!header) return false;
  const parts = header.trim().split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return false;
  return parts[1] === serviceRoleKey;
}

function toInsertableEventRow(event: UnprocessedEvent): InsertableEventRow {
  return {
    event_id: event.event_id,
    user_id: event.user_id,
    type: event.type,
    convention_id: event.convention_id,
    payload: event.payload,
    occurred_at: event.occurred_at,
  };
}

async function processQueue(): Promise<{
  fetched: number;
  processed: number;
  failed: number;
}> {
  const { data: events, error: fetchError } = await supabaseAdmin.rpc(
    "fetch_unprocessed_events",
    { batch_size: BATCH_SIZE, min_age_seconds: 3 },
  );

  if (fetchError) {
    console.error("[process-achievements] Failed to fetch unprocessed events", {
      error: fetchError,
    });
    throw new Error(`Failed to fetch events: ${fetchError.message}`);
  }

  const rows = (events ?? []) as UnprocessedEvent[];

  if (rows.length === 0) {
    return { fetched: 0, processed: 0, failed: 0 };
  }

  console.log(
    `[process-achievements] Processing batch of ${rows.length} events`,
  );

  let processed = 0;
  let failed = 0;

  for (const event of rows) {
    try {
      const eventRow = toInsertableEventRow(event);
      await processAchievementsForEvent(supabaseAdmin, eventRow);

      const { error: stampError } = await supabaseAdmin
        .from("events")
        .update({ processed_at: new Date().toISOString() })
        .eq("event_id", event.event_id);

      if (stampError) {
        console.error(
          "[process-achievements] Failed to stamp processed_at",
          { event_id: event.event_id, error: stampError },
        );
        failed++;
      } else {
        processed++;
      }
    } catch (error) {
      // retry_count was already incremented atomically by fetch_unprocessed_events,
      // so we only need to record the error message here.
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[process-achievements] Failed to process event", {
        event_id: event.event_id,
        type: event.type,
        retry_count: event.retry_count,
        error: errorMessage,
      });

      const { error: updateError } = await supabaseAdmin
        .from("events")
        .update({ last_error: errorMessage })
        .eq("event_id", event.event_id);

      if (updateError) {
        console.error(
          "[process-achievements] Failed to record last_error",
          { event_id: event.event_id, error: updateError },
        );
      }

      failed++;
    }
  }

  console.log("[process-achievements] Batch complete", {
    fetched: rows.length,
    processed,
    failed,
  });

  return { fetched: rows.length, processed, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  if (!isServiceRoleAuth(req)) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  try {
    const result = await processQueue();
    return jsonResponse(200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[process-achievements] Queue processing failed", { error });
    return jsonResponse(500, { error: message });
  }
});
