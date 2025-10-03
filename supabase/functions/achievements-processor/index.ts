/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- Deno functions import via remote URL
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { createAchievementProcessor } from "../../shared/achievements/processor.ts";
import type {
  Achievement,
  Json,
  AchievementEvent,
} from "../../shared/achievements/processor.ts";

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

async function handleAwardGranted({
  userId,
  achievement,
  context,
  event,
}: {
  userId: string;
  achievement: Achievement;
  context: Json;
  event: AchievementEvent | null;
}) {
  if (!userId) return;

  const notification = {
    user_id: userId,
    achievement_key: achievement.key,
    context,
    event_id: event?.id ?? null,
    event_type: event?.event_type ?? null,
  } as const;

  const { error } = await supabaseAdmin
    .from("achievement_notifications")
    .insert(notification);

  if (error) {
    if (error.code === "23505") {
      console.debug(
        `[achievements-processor] Notification exists for ${achievement.key} (${event?.id ?? "no-event"})`,
      );
      return;
    }
    console.error("Failed inserting achievement notification", error);
  }
}

const processor = createAchievementProcessor({
  supabase: supabaseAdmin,
  onAwardGranted: handleAwardGranted,
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
  const limit = limitParam ? Math.max(1, Math.min(100, Number.parseInt(limitParam, 10) || 0)) : 25;
  const maxBatches = maxBatchesParam
    ? Math.max(1, Math.min(40, Number.parseInt(maxBatchesParam, 10) || 0))
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
