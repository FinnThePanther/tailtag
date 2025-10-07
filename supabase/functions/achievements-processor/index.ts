/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- Deno functions import via remote URL
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { createAchievementProcessor } from "../../shared/achievements/processor.ts";
import { processDailyTasksForEvent } from "../../shared/daily-tasks/process.ts";

type BatchOptions = {
  limitPerBatch?: number;
  maxBatches?: number;
};

const corsHeaders = {
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

const processor = createAchievementProcessor({
  supabase: supabaseAdmin,
  onEventProcessed: async ({ event }) => {
    try {
      await processDailyTasksForEvent({ event, supabase: supabaseAdmin });
    } catch (dailyError) {
      console.error(
        `[achievements-processor] Failed updating daily tasks for event ${event.id}`,
        dailyError,
      );
    }
  },
});

async function processPendingEvents(options?: BatchOptions) {
  return processor.processPendingEvents(options);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const maxBatchesParam = url.searchParams.get("max_batches");
  let body: { limit?: unknown; max_batches?: unknown } = {};

  if (req.method === "POST" || req.method === "PATCH" || req.method === "PUT") {
    try {
      body = await req.json();
    } catch (parseError) {
      console.error("Failed to parse achievements-processor request body", parseError);
      body = {};
    }
  }

  const limitInput = body.limit ?? limitParam;
  const maxBatchesInput = body.max_batches ?? maxBatchesParam;

  const limit = limitInput
    ? Math.max(1, Math.min(100, Number.parseInt(String(limitInput), 10) || 0))
    : 25;
  const maxBatches = maxBatchesInput
    ? Math.max(1, Math.min(40, Number.parseInt(String(maxBatchesInput), 10) || 0))
    : 10;

  try {
    const { processed, results } = await processPendingEvents({
      limitPerBatch: limit,
      maxBatches,
    });

    return new Response(
      JSON.stringify({ processed, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Unexpected error running achievements processor", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

export { processPendingEvents };
