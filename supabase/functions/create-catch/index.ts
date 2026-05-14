/// <reference lib="deno.unstable" />
/**
 * Supabase Edge Function: create-catch
 *
 * Handles catch creation with approval mode support.
 * Creates catches with appropriate status based on the owner's profile settings.
 */

// eslint-disable-next-line import/no-unresolved -- Deno edge functions import via remote URL
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import { loadGameplayQueueConfig, scheduleGameplayQueueDrain } from '../_shared/gameplayQueue.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-client-attempt-id, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('ANON_KEY');
const serviceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  throw new Error('Missing Supabase configuration');
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
  client_attempt_id?: string;
  app_version?: string | null;
  platform?: string | null;
  network_type?: string | null;
  method?: 'code' | 'camera_photo' | 'gallery_photo';
  fursuit_id: string;
  convention_id?: string | null;
  is_tutorial?: boolean;
  force_pending?: boolean;
  has_photo?: boolean;
  catch_photo_path?: string | null;
  catch_photo_url?: string | null;
  catch_photo_source?: 'camera' | 'gallery' | null;
}

interface UpdateCatchPhotoRequest {
  catch_id: string;
  catch_photo_path?: string;
  catch_photo_url: string;
  catch_photo_source?: 'camera' | 'gallery' | null;
}

interface CreateCatchResponse {
  client_attempt_id?: string;
  catch_id: string;
  status: string;
  expires_at: string | null;
  catch_number: number | null;
  requires_approval: boolean;
  fursuit_owner_id: string;
  convention_id?: string | null;
  event_id: string;
  event_duplicate?: boolean;
  event_enqueued?: boolean;
}

type CatchPerformanceMethod = 'code' | 'camera_photo' | 'gallery_photo';
type CatchPerformanceResult = 'success' | 'pending_approval' | 'failed' | 'timeout';
type ServerTimingKey =
  | 'auth_ms'
  | 'block_check_ms'
  | 'catch_insert_ms'
  | 'photo_attach_ms'
  | 'metadata_ms'
  | 'notification_ms'
  | 'event_ingest_ms'
  | 'queue_config_ms'
  | 'inline_processing_ms'
  | 'edge_total_ms';

const now = () => performance.now();
const roundMs = (duration: number) => Math.max(0, Math.round(duration));

function normalizeClientAttemptId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeCatchMethod(value: unknown): CatchPerformanceMethod {
  if (value === 'camera_photo' || value === 'gallery_photo' || value === 'code') {
    return value;
  }

  return 'code';
}

function createServerCatchPerformanceTrace(initialClientAttemptId: string | null) {
  let clientAttemptId = initialClientAttemptId;
  const startedAt = now();
  const timings: Partial<Record<ServerTimingKey, number>> = {};

  const recordTiming = (key: ServerTimingKey, durationMs: number | null | undefined) => {
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) {
      return;
    }

    timings[key] = roundMs(durationMs);
  };

  const measure = async <T>(
    key: ServerTimingKey,
    operation: () => T | PromiseLike<T>,
  ): Promise<Awaited<T>> => {
    const phaseStartedAt = now();
    try {
      return (await operation()) as Awaited<T>;
    } finally {
      recordTiming(key, now() - phaseStartedAt);
    }
  };

  const finish = (options: {
    userId?: string | null;
    catchId?: string | null;
    conventionId?: string | null;
    method: CatchPerformanceMethod;
    result: CatchPerformanceResult;
    appVersion?: string | null;
    platform?: string | null;
    networkType?: string | null;
    errorCode?: string | null;
  }) => {
    if (!clientAttemptId) {
      return;
    }

    const totalMs = roundMs(now() - startedAt);
    timings.edge_total_ms = totalMs;

    void Promise.resolve(
      supabaseAdmin.from('catch_performance_events').insert({
        client_attempt_id: clientAttemptId,
        user_id: options.userId ?? null,
        catch_id: options.catchId ?? null,
        convention_id: options.conventionId ?? null,
        method: options.method,
        result: options.result,
        total_ms: totalMs,
        timings: { ...timings },
        app_version: options.appVersion ?? null,
        platform: options.platform ?? null,
        network_type: options.networkType ?? null,
        error_code: options.errorCode ?? null,
      }),
    )
      .then(({ error }) => {
        if (error) {
          console.error('[create-catch] Failed to record catch performance telemetry:', error);
        }
      })
      .catch((error) => {
        console.error('[create-catch] Failed to record catch performance telemetry:', error);
      });
  };

  return {
    get clientAttemptId() {
      return clientAttemptId;
    },
    setClientAttemptId(value: string | null) {
      if (value) {
        clientAttemptId = value;
      }
    },
    finish,
    measure,
    recordTiming,
  };
}

function jsonResponse(status: number, payload: unknown, clientAttemptId?: string | null) {
  const responsePayload =
    clientAttemptId && typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? { ...payload, client_attempt_id: clientAttemptId }
      : payload;

  return new Response(JSON.stringify(responsePayload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function normalizeCatchPhotoSource(value: unknown): 'camera' | 'gallery' | null {
  if (value === 'camera' || value === 'gallery') {
    return value;
  }

  return null;
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const token = extractBearerToken(req);
  if (!token) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    console.error('[create-catch] Failed to resolve user from bearer token', {
      error: error?.message ?? 'Unknown auth error',
    });
    return null;
  }

  return data.user.id;
}

function scheduleBackgroundTask(label: string, task: () => Promise<void>): void {
  const promise = task().catch((error) => {
    console.error(`[create-catch] Background task failed: ${label}`, error);
  });

  const edgeRuntime = (
    globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }
  ).EdgeRuntime;

  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(promise);
    return;
  }

  void promise;
}

function scheduleQueueWakeup(): void {
  scheduleBackgroundTask('wake gameplay queue', async () => {
    const queueConfig = await loadGameplayQueueConfig(supabaseAdmin);
    if (!queueConfig.queueEnabled || !queueConfig.wakeupEnabled) {
      return;
    }

    scheduleGameplayQueueDrain({
      supabaseUrl: resolvedSupabaseUrl,
      serviceRoleKey: resolvedServiceRoleKey,
      maxMessages: queueConfig.wakeupMaxMessages,
      maxDurationMs: queueConfig.wakeupMaxDurationMs,
    });
  });
}

async function handlePost(req: Request): Promise<Response> {
  const trace = createServerCatchPerformanceTrace(
    normalizeClientAttemptId(req.headers.get('x-client-attempt-id')),
  );
  let userId: string | null = null;
  let body: CreateCatchRequest | null = null;
  let method: CatchPerformanceMethod = 'code';
  let catchId: string | null = null;
  let resolvedConventionId: string | null = null;

  const finishTrace = async (options: {
    result: CatchPerformanceResult;
    errorCode?: string | null;
  }) =>
    await trace.finish({
      userId,
      catchId,
      conventionId: resolvedConventionId ?? body?.convention_id ?? null,
      method,
      result: options.result,
      appVersion:
        typeof body?.app_version === 'string' && body.app_version.trim().length > 0
          ? body.app_version
          : null,
      platform:
        typeof body?.platform === 'string' && body.platform.trim().length > 0
          ? body.platform
          : null,
      networkType:
        typeof body?.network_type === 'string' && body.network_type.trim().length > 0
          ? body.network_type
          : null,
      errorCode: options.errorCode ?? null,
    });

  const failureResponse = async (status: number, payload: unknown, errorCode: string) => {
    await finishTrace({ result: 'failed', errorCode });
    return jsonResponse(status, payload, trace.clientAttemptId);
  };

  userId = await trace.measure('auth_ms', () => getUserIdFromRequest(req));
  if (!userId) {
    return failureResponse(401, { error: 'Unauthorized' }, 'unauthorized');
  }

  try {
    body = (await req.json()) as CreateCatchRequest;
    trace.setClientAttemptId(normalizeClientAttemptId(body.client_attempt_id));
    method = normalizeCatchMethod(body.method);
  } catch {
    return failureResponse(400, { error: 'Invalid JSON payload' }, 'invalid_json');
  }

  if (!body?.fursuit_id) {
    return failureResponse(400, { error: 'Missing fursuit_id' }, 'missing_fursuit_id');
  }

  if (body.has_photo === true && !body.catch_photo_url) {
    return failureResponse(400, { error: 'Missing catch_photo_url' }, 'missing_photo_url');
  }

  const catchPhotoSource = normalizeCatchPhotoSource(body.catch_photo_source);

  if (body.catch_photo_source && !catchPhotoSource) {
    return failureResponse(400, { error: 'Invalid catch_photo_source' }, 'invalid_photo_source');
  }

  if (catchPhotoSource === 'gallery' && (!body.has_photo || !body.catch_photo_url)) {
    return failureResponse(
      400,
      { error: 'Gallery catches require a photo' },
      'gallery_photo_required',
    );
  }

  try {
    // Check if catcher and fursuit owner have blocked each other
    const fursuitRow = await trace.measure('block_check_ms', async () => {
      const { data: ownerRow } = await supabaseAdmin
        .from('fursuits')
        .select('owner_id')
        .eq('id', body.fursuit_id)
        .single();

      if (ownerRow?.owner_id) {
        const { data: blocked } = await supabaseAdmin.rpc('is_blocked', {
          p_user_a: userId,
          p_user_b: ownerRow.owner_id,
        });

        return { owner_id: ownerRow.owner_id, blocked };
      }

      return { owner_id: ownerRow?.owner_id ?? null, blocked: false };
    });

    if (fursuitRow?.blocked === true) {
      return failureResponse(403, { error: 'Cannot catch this fursuit' }, 'blocked_user');
    }

    // The RPC performs catch validation, inserts the catch/photo fields, and durably
    // enqueues the canonical gameplay event in one database transaction.
    const { data, error } = await trace.measure('catch_insert_ms', () =>
      supabaseAdmin.rpc('create_catch_with_event', {
        p_fursuit_id: body.fursuit_id,
        p_catcher_id: userId,
        p_convention_id: body.convention_id || null,
        p_is_tutorial: body.is_tutorial || false,
        p_force_pending: body.force_pending || catchPhotoSource === 'gallery',
        p_catch_photo_source: catchPhotoSource,
        p_catch_photo_path: body.catch_photo_path ?? null,
        p_catch_photo_url: body.catch_photo_url ?? null,
        p_client_attempt_id: trace.clientAttemptId ?? null,
      }),
    );

    if (error) {
      // Handle specific error cases
      if (error.message?.includes('Cannot catch your own fursuit')) {
        return failureResponse(400, { error: 'Cannot catch your own fursuit' }, 'self_catch');
      }
      if (error.message?.includes('already caught')) {
        return failureResponse(
          400,
          { error: 'Fursuit already caught at this convention' },
          'already_caught',
        );
      }
      if (error.message?.includes('Convention is not live')) {
        return failureResponse(400, { error: 'Convention is not live' }, 'convention_not_live');
      }
      if (error.message?.includes('Convention is not accepting gallery catches')) {
        return failureResponse(
          400,
          { error: 'Convention is not accepting gallery catches' },
          'gallery_closed',
        );
      }
      if (
        error.message?.includes('Catcher must join the live convention') ||
        error.message?.includes('Catcher must have a playable convention') ||
        error.message?.includes('Fursuit owner must join the live convention') ||
        error.message?.includes('Fursuit owner must have a playable convention') ||
        error.message?.includes('Fursuit must be assigned to the live convention')
      ) {
        return failureResponse(
          400,
          {
            error:
              'You and this fursuit must share a playable convention, and the fursuit must be assigned to that convention before catching.',
          },
          'shared_convention_required',
        );
      }
      if (error.message?.includes('not found')) {
        return failureResponse(404, { error: 'Fursuit not found' }, 'fursuit_not_found');
      }

      console.error('[create-catch] RPC error:', error);
      return failureResponse(500, { error: 'Failed to create catch' }, 'catch_insert_failed');
    }

    const result = data as CreateCatchResponse;
    catchId = result.catch_id;
    resolvedConventionId = result.convention_id ?? body.convention_id ?? null;

    if (result.event_enqueued === true && result.event_duplicate !== true) {
      scheduleQueueWakeup();
    }

    await finishTrace({ result: result.requires_approval ? 'pending_approval' : 'success' });

    return jsonResponse(201, result, trace.clientAttemptId);
  } catch (error) {
    console.error('[create-catch] Unexpected error:', error);
    await finishTrace({ result: 'failed', errorCode: 'internal_error' });
    return jsonResponse(500, { error: 'Internal server error' }, trace.clientAttemptId);
  }
}

async function handlePatch(req: Request): Promise<Response> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  let body: UpdateCatchPhotoRequest;
  try {
    body = (await req.json()) as UpdateCatchPhotoRequest;
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON payload' });
  }

  if (!body.catch_id || !body.catch_photo_url) {
    return jsonResponse(400, { error: 'Missing catch_id or catch_photo_url' });
  }

  // Verify the catch belongs to this user
  const { data: catchRow, error: fetchError } = await supabaseAdmin
    .from('catches')
    .select('id, catcher_id')
    .eq('id', body.catch_id)
    .single();

  if (fetchError || !catchRow) {
    return jsonResponse(404, { error: 'Catch not found' });
  }

  if ((catchRow as { catcher_id: string }).catcher_id !== userId) {
    return jsonResponse(403, { error: 'Forbidden' });
  }

  const { error: updateError } = await supabaseAdmin
    .from('catches')
    .update({
      catch_photo_path: body.catch_photo_path ?? null,
      catch_photo_url: body.catch_photo_url,
      catch_photo_source: normalizeCatchPhotoSource(body.catch_photo_source) ?? 'camera',
    })
    .eq('id', body.catch_id);

  if (updateError) {
    console.error('[create-catch] Failed to update catch photo:', updateError);
    return jsonResponse(500, { error: 'Failed to update catch photo' });
  }

  // Now that the photo URL is attached, notify the fursuit owner.
  // We do this here (not in POST) so the owner sees the photo immediately on their card.
  try {
    const { data: catchCtx, error: catchCtxError } = await supabaseAdmin
      .from('catches')
      .select(
        'catcher_id, fursuit_id, status, fursuits!catches_fursuit_id_fkey(owner_id, name), profiles!catches_catcher_id_fkey(username)',
      )
      .eq('id', body.catch_id)
      .single();

    if (catchCtxError) {
      throw catchCtxError;
    }

    if (catchCtx) {
      const fursuit = Array.isArray(catchCtx.fursuits) ? catchCtx.fursuits[0] : catchCtx.fursuits;
      const profile = Array.isArray(catchCtx.profiles) ? catchCtx.profiles[0] : catchCtx.profiles;
      const fursuitOwnerId = (fursuit as { owner_id: string } | null)?.owner_id;
      const fursuitName = (fursuit as { name: string } | null)?.name ?? 'Unknown Fursuit';
      const catcherUsername = (profile as { username: string } | null)?.username ?? 'Someone';
      const catchStatus = (catchCtx as { status?: string }).status;

      if (fursuitOwnerId) {
        const { error: notifError } =
          catchStatus === 'PENDING'
            ? await supabaseAdmin.rpc('notify_catch_pending', {
                p_catch_id: body.catch_id,
                p_fursuit_owner_id: fursuitOwnerId,
                p_catcher_id: catchCtx.catcher_id,
                p_fursuit_name: fursuitName,
                p_catcher_username: catcherUsername,
              })
            : catchStatus === 'ACCEPTED'
              ? await supabaseAdmin.from('notifications').insert({
                  user_id: fursuitOwnerId,
                  type: 'fursuit_caught',
                  payload: {
                    catch_id: body.catch_id,
                    catcher_id: catchCtx.catcher_id,
                    fursuit_id: catchCtx.fursuit_id,
                    fursuit_name: fursuitName,
                    catcher_username: catcherUsername,
                  },
                })
              : { error: null };

        if (notifError) {
          console.error('[create-catch] Failed to send photo catch notification:', notifError);
        }
      }
    }
  } catch (notifError) {
    console.error('[create-catch] Error sending photo catch notification:', notifError);
    // Don't fail the response — the photo was attached successfully
  }

  return jsonResponse(200, { success: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method === 'POST') {
    return handlePost(req);
  }

  if (req.method === 'PATCH') {
    return handlePatch(req);
  }

  return jsonResponse(405, { error: 'Method not allowed' });
});
