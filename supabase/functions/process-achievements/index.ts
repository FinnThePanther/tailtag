/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions use remote esm.sh imports.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { processAchievementsForEvent } from "../_shared/achievements.ts";
import type { InsertableEventRow } from "../_shared/types.ts";

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
const STUCK_EVENT_THRESHOLD_MINUTES = 2;

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

  // Warn about events stuck longer than the threshold — indicates inline processing
  // and at least one previous cron/webhook pass failed for these events.
  const stuckThreshold = new Date(
    Date.now() - STUCK_EVENT_THRESHOLD_MINUTES * 60 * 1000,
  ).toISOString();
  const stuckEvents = rows.filter((e) => e.received_at < stuckThreshold);
  if (stuckEvents.length > 0) {
    console.error(
      `[process-achievements] STUCK_EVENTS: ${stuckEvents.length} event(s) unprocessed for >${STUCK_EVENT_THRESHOLD_MINUTES}min`,
      {
        event_ids: stuckEvents.map((e) => e.event_id),
        types: stuckEvents.map((e) => e.type),
        retry_counts: stuckEvents.map((e) => e.retry_count),
      },
    );
  }

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

  try {
    const result = await processQueue();
    return jsonResponse(200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[process-achievements] Queue processing failed", { error });
    return jsonResponse(500, { error: message });
  }
});
