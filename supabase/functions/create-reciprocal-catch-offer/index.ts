/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- Deno edge functions import via remote URL
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import { loadGameplayQueueConfig, scheduleGameplayQueueDrain } from '../_shared/gameplayQueue.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('ANON_KEY');
const serviceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  throw new Error('Missing Supabase configuration');
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function normalizeUuidLike(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function scheduleQueueWakeup() {
  void loadGameplayQueueConfig(supabaseAdmin)
    .then((config) => scheduleGameplayQueueDrain(config))
    .catch((error) => {
      console.error('[create-reciprocal-catch-offer] Queue wakeup failed:', error);
    });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON payload' });
  }

  const primaryCatchId = normalizeUuidLike(body.primary_catch_id);
  const offeredFursuitId = normalizeUuidLike(body.offered_fursuit_id);

  if (!primaryCatchId) {
    return jsonResponse(400, { error: 'Missing primary_catch_id' });
  }

  if (!offeredFursuitId) {
    return jsonResponse(400, { error: 'Missing offered_fursuit_id' });
  }

  const { data: reciprocalOffer, error } = await supabaseAdmin.rpc(
    'create_catch_reciprocal_offer',
    {
      p_primary_catch_id: primaryCatchId,
      p_offered_fursuit_id: offeredFursuitId,
      p_offered_by_profile_id: user.id,
    },
  );

  if (error) {
    console.error('[create-reciprocal-catch-offer] RPC error:', error);

    const message =
      typeof error.message === 'string' && error.message.length > 0
        ? error.message
        : "We couldn't offer that back-tag.";

    return jsonResponse(400, { error: message });
  }

  if (
    reciprocalOffer &&
    typeof reciprocalOffer === 'object' &&
    'event_enqueued' in reciprocalOffer &&
    reciprocalOffer.event_enqueued === true
  ) {
    scheduleQueueWakeup();
  }

  return jsonResponse(201, { reciprocal_offer: reciprocalOffer ?? null });
});
