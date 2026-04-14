/// <reference lib="deno.unstable" />
/**
 * Supabase Edge Function: events-ingress
 *
 * Environment variables:
 * - SUPABASE_URL: Supabase project URL
 * - SERVICE_ROLE_KEY: Service role key (or SUPABASE_SERVICE_ROLE_KEY) for privileged inserts
 */
// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions use remote esm.sh imports.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import {
  ingestGameplayEvent,
  loadGameplayQueueConfig,
  scheduleGameplayQueueDrain,
} from '../_shared/gameplayQueue.ts';
import type { EventRequestBody, Json } from '../_shared/types.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing Supabase configuration (SUPABASE_URL / SERVICE_ROLE_KEY)');
}

const resolvedSupabaseUrl = supabaseUrl;
const resolvedServiceRoleKey = serviceRoleKey;

const supabaseAdmin = createClient(resolvedSupabaseUrl, resolvedServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function jsonResponse(status: number, payload: Json) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeEventType(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 128) {
    return null;
  }
  if (!/^[a-z0-9_.:-]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function normalizeConventionId(input: unknown): string | null {
  if (input === null || input === undefined || input === '') {
    return null;
  }
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed;
}

function normalizeOccurredAt(input: unknown): string | null {
  if (input === null || input === undefined || input === '') {
    return new Date().toISOString();
  }

  if (typeof input === 'number') {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return new Date().toISOString();
    }
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

function coercePayload(value: unknown): Json {
  if (!isRecord(value)) {
    return {};
  }

  return value;
}

function extractBearerAuthorization(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!header) {
    return null;
  }
  const parts = header.trim().split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  return `Bearer ${parts[1]}`;
}

/**
 * Check if request is authenticated with service role key
 */
function isServiceRoleAuth(req: Request): boolean {
  const token = extractBearerAuthorization(req);
  if (!token) {
    return false;
  }

  // Extract the JWT part (after "Bearer ")
  const jwtToken = token.substring(7);

  // Compare with service role key
  return jwtToken === serviceRoleKey;
}

async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const token = extractBearerAuthorization(req);

  if (!token) {
    return null;
  }

  const jwt = token.substring(7);
  const { data, error } = await supabaseAdmin.auth.getUser(jwt);

  if (error || !data.user) {
    console.error('[events-ingress] Failed to resolve user from bearer token', {
      error: error?.message ?? 'Unknown auth error',
    });
    return null;
  }

  return data.user.id;
}

async function handlePost(req: Request): Promise<Response> {
  let parsed: EventRequestBody;

  try {
    parsed = (await req.json()) as EventRequestBody;
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON payload' });
  }

  // Check authentication: either user JWT or service role
  const isServiceRole = isServiceRoleAuth(req);
  let userId: string | null = null;

  if (isServiceRole) {
    // For service role requests, user_id must be in payload
    userId = typeof parsed.user_id === 'string' ? parsed.user_id : null;

    if (!userId) {
      return jsonResponse(400, { error: 'user_id required for service role requests' });
    }
  } else {
    // For user requests, get user from JWT
    userId = await getUserIdFromRequest(req);

    if (!userId) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }
  }

  const type = normalizeEventType(parsed.type);

  if (!type) {
    return jsonResponse(400, { error: 'Missing or invalid event type' });
  }

  const conventionId = normalizeConventionId(parsed.convention_id);
  const occurredAt = normalizeOccurredAt(parsed.occurred_at);

  if (!occurredAt) {
    return jsonResponse(400, { error: 'Invalid occurred_at value' });
  }

  const payload = coercePayload(parsed.payload);
  const idempotencyKey =
    typeof parsed.idempotency_key === 'string' && parsed.idempotency_key.trim().length > 0
      ? parsed.idempotency_key.trim()
      : null;

  let ingestResult: { eventId: string; duplicate: boolean; enqueued: boolean };
  const ingestStart = Date.now();

  try {
    ingestResult = await ingestGameplayEvent(supabaseAdmin, {
      type,
      userId,
      conventionId,
      payload,
      occurredAt,
      idempotencyKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[events-ingress] Failed ingest_gameplay_event RPC', {
      type,
      userId,
      conventionId,
      error: message,
    });

    const isClientError =
      message.includes('Unsupported event type') ||
      message.includes('Missing event type') ||
      message.includes('Missing user_id');

    return jsonResponse(isClientError ? 400 : 500, {
      error: isClientError ? message : 'Failed to persist event',
    });
  }

  const ingestDuration = Date.now() - ingestStart;
  console.log(`[events-ingress] Event ingested in ${ingestDuration}ms`, {
    event_id: ingestResult.eventId,
    type,
    duplicate: ingestResult.duplicate,
    enqueued: ingestResult.enqueued,
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

  console.log(`[events-ingress] Returning response for event ${ingestResult.eventId}`);

  // Return immediately with event_id
  // Achievements will be delivered via Realtime subscriptions
  return jsonResponse(201, {
    event_id: ingestResult.eventId,
    awards: [],
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  return handlePost(req);
});
