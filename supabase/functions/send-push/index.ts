/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions use remote imports.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import { jwtVerify } from 'https://esm.sh/jose@5.6.3';
import {
  beginBackendWorkerRun,
  completeBackendWorkerRun,
  type BackendWorkerRunStatus,
} from '../_shared/backendWorkerRuns.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
// JWT secret for verifying tokens. Required for token verification.
// Set via: supabase secrets set SUPABASE_JWT_SECRET=your-jwt-secret
const supabaseJwtSecret = Deno.env.get('SUPABASE_JWT_SECRET') ?? Deno.env.get('JWT_SECRET') ?? null;
const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN') ?? null;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SERVICE_ROLE_KEY environment variables');
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const SUPPORTED_TYPES = new Set([
  'achievement_awarded',
  'convention_started',
  'fursuit_caught',
  'catch_pending',
  'catch_confirmed',
  'catch_rejected',
  'catch_expired',
  'catch_invite_claimed',
  'catch_invite_approved',
  'catch_invite_declined',
  'catch_invite_reported',
  'daily_all_complete',
  'convention_recap_ready',
]);

type NotificationRecord = {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type WebhookPayload = {
  type: string;
  table: string;
  schema: string;
  record: NotificationRecord;
};

type ExpoPushResponse = {
  data?:
    | {
        status?: string;
        message?: string;
        details?: { error?: string };
      }
    | Array<{
        status?: string;
        message?: string;
        details?: { error?: string };
      }>;
  errors?: Array<{ code?: string; message?: string }>;
};

type PushFailureContext = {
  notificationId: string;
  userId: string;
  notificationType: string;
  payload: Record<string, unknown>;
  requestBody: Record<string, unknown>;
  responseStatus?: number;
  responseBody?: ExpoPushResponse | null;
  errorMessage: string;
};

type PushRunPayload = {
  success?: boolean;
  skipped?: string;
  error?: string;
  retry_enqueued?: boolean;
  expo_ticket_errors?: number;
  token_cleared?: boolean;
};

function respondJson(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function extractString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function isAdultBoundaryChecked(payload: Record<string, unknown>): boolean {
  return payload.adult_boundary_checked === true;
}

function isUserFacingAchievementName(value: string): boolean {
  const looksLikeInternalKey = /^[A-Z0-9_]+$/.test(value) || /^[a-z0-9_]+$/.test(value);
  const containsUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(value);

  return !looksLikeInternalKey && !containsUuid;
}

async function resolveAchievementName(payload: Record<string, unknown>): Promise<string> {
  const existing = extractString(payload.achievement_name);
  if (existing && isUserFacingAchievementName(existing)) {
    return existing;
  }

  const achievementId = extractString(payload.achievement_id);
  if (achievementId) {
    const { data, error } = await supabaseAdmin
      .from('achievements')
      .select('name')
      .eq('id', achievementId)
      .maybeSingle();
    if (!error && data?.name && isUserFacingAchievementName(data.name)) {
      payload.achievement_name = data.name;
      return data.name;
    }
  }

  const achievementKey = extractString(payload.achievement_key);
  if (achievementKey) {
    const { data, error } = await supabaseAdmin
      .from('achievements')
      .select('name')
      .eq('key', achievementKey)
      .maybeSingle();
    if (!error && data?.name && isUserFacingAchievementName(data.name)) {
      payload.achievement_name = data.name;
      return data.name;
    }
  }

  return 'achievement';
}

async function buildMessage(
  type: string,
  payload: Record<string, unknown>,
): Promise<{ title: string; body: string } | null> {
  switch (type) {
    case 'achievement_awarded': {
      const achievementName = await resolveAchievementName(payload);
      return {
        title: 'Achievement Unlocked!',
        body: `You earned: ${achievementName}`,
      };
    }
    case 'convention_started': {
      const conventionName = extractString(payload.convention_name) ?? 'your convention';
      const requiresLocationVerification = payload.location_verification_required === true;
      return {
        title: 'TailTag is live',
        body: requiresLocationVerification
          ? `TailTag is live at ${conventionName}. Verify on-site to start catching.`
          : `TailTag is live at ${conventionName}. You can start catching now.`,
      };
    }
    case 'catch_pending': {
      if (!isAdultBoundaryChecked(payload)) {
        return {
          title: 'Catch Request',
          body: 'Someone wants to catch your fursuit',
        };
      }
      const catcherUsername = extractString(payload.catcher_username) ?? 'Someone';
      const fursuitName = extractString(payload.fursuit_name) ?? 'your fursuit';
      return {
        title: 'Catch Request',
        body: `${catcherUsername} wants to catch ${fursuitName}`,
      };
    }
    case 'fursuit_caught': {
      if (!isAdultBoundaryChecked(payload)) {
        return {
          title: 'Your Fursuit Was Caught!',
          body: 'Someone caught your fursuit',
        };
      }
      const catcherUsername = extractString(payload.catcher_username) ?? 'Someone';
      const fursuitName = extractString(payload.fursuit_name) ?? 'your fursuit';
      return {
        title: 'Your Fursuit Was Caught!',
        body: `${catcherUsername} caught ${fursuitName}`,
      };
    }
    case 'catch_confirmed': {
      if (!isAdultBoundaryChecked(payload)) {
        return {
          title: 'Catch Approved!',
          body: 'Your catch was approved',
        };
      }
      const fursuitName = extractString(payload.fursuit_name) ?? 'a fursuit';
      return {
        title: 'Catch Approved!',
        body: `Your catch of ${fursuitName} was approved!`,
      };
    }
    case 'catch_rejected': {
      if (!isAdultBoundaryChecked(payload)) {
        return {
          title: 'Catch Declined',
          body: 'Your catch request was declined',
        };
      }
      const fursuitName = extractString(payload.fursuit_name) ?? 'a fursuit';
      return {
        title: 'Catch Declined',
        body: `Your request for ${fursuitName} was declined`,
      };
    }
    case 'catch_expired': {
      if (!isAdultBoundaryChecked(payload)) {
        return {
          title: 'Catch Expired',
          body: 'A pending catch request expired',
        };
      }
      const fursuitName = extractString(payload.fursuit_name) ?? 'a fursuit';
      const catcherUsername = extractString(payload.catcher_username);
      const recipientRole = extractString(payload.recipient_role);
      if (recipientRole === 'owner') {
        return {
          title: 'Catch Request Expired',
          body: `${catcherUsername ?? 'Someone'}'s request for ${fursuitName} expired`,
        };
      }
      return {
        title: 'Catch Expired',
        body: `Your request for ${fursuitName} expired`,
      };
    }
    case 'catch_invite_claimed':
      return {
        title: 'Invite Claimed',
        body: 'Your TailTag invite was claimed. They can approve the catch after choosing their suit.',
      };
    case 'catch_invite_approved': {
      const fursuitName = extractString(payload.fursuit_name) ?? 'their fursuit';
      return {
        title: 'Invite Catch Approved',
        body: `Your catch of ${fursuitName} now counts.`,
      };
    }
    case 'catch_invite_declined':
      return {
        title: 'Invite Declined',
        body: 'Your TailTag invite catch was declined.',
      };
    case 'catch_invite_reported':
      return {
        title: 'Invite Reported',
        body: 'Your TailTag invite was reported and is under review.',
      };
    case 'daily_all_complete':
      return {
        title: 'All Tasks Complete!',
        body: "Great job finishing today's tasks!",
      };
    case 'convention_recap_ready': {
      const conventionName = extractString(payload.convention_name) ?? 'your convention';
      return {
        title: 'Convention Recap Ready',
        body: `Your ${conventionName} recap is ready.`,
      };
    }
    default:
      return null;
  }
}

async function clearPushToken(userId: string) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      expo_push_token: null,
      push_notifications_enabled: false,
    })
    .eq('id', userId);

  if (error) {
    console.error('[send-push] Failed clearing invalid token', { userId, error });
  }
}

function extractExpoErrors(responseJson: ExpoPushResponse): string[] {
  const results = responseJson?.data;
  const entries = Array.isArray(results) ? results : results ? [results] : [];
  const errors: string[] = [];

  for (const entry of entries) {
    if (entry?.status === 'error') {
      const code = entry?.details?.error;
      if (code) {
        errors.push(code);
      }
    }
  }

  return errors;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

function parseSource(req: Request): string {
  const userAgent = req.headers.get('User-Agent') ?? '';
  if (userAgent.startsWith('pg_net/')) {
    return 'pg_net_webhook';
  }

  const url = new URL(req.url);
  return url.searchParams.get('source')?.trim() || 'webhook';
}

async function readPushRunPayload(response: Response): Promise<PushRunPayload> {
  try {
    const payload = await response.clone().json();
    return toRecord(payload) as PushRunPayload;
  } catch {
    return {};
  }
}

function pushRunStatus(response: Response, payload: PushRunPayload): BackendWorkerRunStatus {
  if (response.status >= 500) {
    return 'failed';
  }
  if (payload.error || (payload.expo_ticket_errors ?? 0) > 0) {
    return 'partial';
  }
  return 'succeeded';
}

function pushRunCounts(payload: PushRunPayload): Record<string, number> {
  return {
    notifications_sent: payload.success ? 1 : 0,
    notifications_skipped: payload.skipped ? 1 : 0,
    errors: payload.error ? 1 : 0,
    retries_enqueued: payload.retry_enqueued ? 1 : 0,
    expo_ticket_errors: payload.expo_ticket_errors ?? 0,
    tokens_cleared: payload.token_cleared ? 1 : 0,
  };
}

async function recordPushFailure(context: PushFailureContext) {
  const occurredAt = new Date().toISOString();
  const queuePayload = {
    notification_id: context.notificationId,
    user_id: context.userId,
    notification_type: context.notificationType,
    payload: context.payload,
    request_body: context.requestBody,
    response_status: context.responseStatus ?? null,
    response_body: context.responseBody ?? null,
    last_error: context.errorMessage,
  };

  try {
    const { error: queueError } = await supabaseAdmin
      .from('push_notification_retry_queue')
      .insert(queuePayload);

    if (queueError) {
      console.error('[send-push] Failed enqueueing push retry', {
        error: queueError,
        notificationId: context.notificationId,
      });
    }
  } catch (error) {
    console.error('[send-push] Failed enqueueing push retry', { error });
  }

  try {
    const { error: logError } = await supabaseAdmin.from('admin_error_log').insert({
      error_type: 'push_notification_failed',
      error_message: context.errorMessage,
      severity: 'error',
      occurred_at: occurredAt,
      context: {
        notification_id: context.notificationId,
        user_id: context.userId,
        notification_type: context.notificationType,
        response_status: context.responseStatus ?? null,
        response_body: context.responseBody ?? null,
      },
    });

    if (logError) {
      console.error('[send-push] Failed logging push error', {
        error: logError,
        notificationId: context.notificationId,
      });
    }
  } catch (error) {
    console.error('[send-push] Failed logging push error', { error });
  }
}

async function handleRequest(req: Request): Promise<Response> {
  let parsed: WebhookPayload;
  try {
    parsed = (await req.json()) as WebhookPayload;
  } catch {
    return respondJson({ error: 'Invalid JSON payload' }, 400);
  }

  const record = parsed?.record;
  if (!record || typeof record !== 'object') {
    return respondJson({ skipped: 'Missing record' }, 200);
  }

  const notificationType = extractString(record.type);
  if (!notificationType) {
    return respondJson({ skipped: 'Missing notification type' }, 200);
  }

  if (notificationType === 'daily_task_completed' || notificationType === 'daily_reset') {
    return respondJson({ skipped: 'Unsupported type' }, 200);
  }

  if (!SUPPORTED_TYPES.has(notificationType)) {
    return respondJson({ skipped: 'Unhandled type' }, 200);
  }

  const userId = extractString(record.user_id);
  if (!userId) {
    return respondJson({ skipped: 'Missing user_id' }, 200);
  }

  const payload = toRecord(record.payload);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('expo_push_token, push_notifications_enabled')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('[send-push] Failed fetching profile', { userId, error: profileError });
    return respondJson({ skipped: 'Profile fetch failed' }, 200);
  }

  if (!profile?.push_notifications_enabled || !profile?.expo_push_token) {
    return respondJson({ skipped: 'Push disabled or missing token' }, 200);
  }

  const message = await buildMessage(notificationType, payload);
  if (!message) {
    return respondJson({ skipped: 'No message template' }, 200);
  }

  const requestBody = {
    to: profile.expo_push_token,
    title: message.title,
    body: message.body,
    data: {
      ...payload,
      type: notificationType,
      notification_id: record.id,
    },
    sound: 'default',
    priority: 'default',
    channelId: 'default',
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (expoAccessToken) {
    headers.Authorization = `Bearer ${expoAccessToken}`;
  }

  let responseJson: ExpoPushResponse | null = null;

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    try {
      responseJson = (await response.json()) as ExpoPushResponse;
    } catch (parseError) {
      console.error('[send-push] Failed parsing Expo response', { parseError });
    }

    if (!response.ok) {
      console.error('[send-push] Expo push failed', {
        status: response.status,
        response: responseJson,
      });
      await recordPushFailure({
        notificationId: record.id,
        userId,
        notificationType,
        payload,
        requestBody,
        responseStatus: response.status,
        responseBody: responseJson,
        errorMessage: `Expo responded with status ${response.status}`,
      });
      // Only return a retryable status for transient Expo failures (5xx/429).
      if (response.status >= 500 || response.status === 429) {
        return respondJson({ error: 'Expo request failed', retry_enqueued: true }, 503);
      }
      return respondJson({ error: 'Expo request failed', retry_enqueued: true }, 200);
    }
  } catch (error) {
    const errorMessage = formatErrorMessage(error);
    console.error('[send-push] Expo push request failed', { error });
    await recordPushFailure({
      notificationId: record.id,
      userId,
      notificationType,
      payload,
      requestBody,
      errorMessage,
    });
    return respondJson({ error: 'Expo request failed', retry_enqueued: true }, 503);
  }

  let retryEnqueued = false;
  let expoTicketErrors = 0;
  let tokenCleared = false;

  if (responseJson) {
    const expoErrors = extractExpoErrors(responseJson);
    if (expoErrors.length > 0) {
      expoTicketErrors = expoErrors.length;
      console.error('[send-push] Expo errors', { expoErrors, response: responseJson });
      await recordPushFailure({
        notificationId: record.id,
        userId,
        notificationType,
        payload,
        requestBody,
        responseStatus: 200,
        responseBody: responseJson,
        errorMessage: `Expo ticket errors: ${expoErrors.join(', ')}`,
      });
      retryEnqueued = true;
    }

    if (expoErrors.includes('DeviceNotRegistered')) {
      await clearPushToken(userId);
      tokenCleared = true;
    }
  }

  return respondJson(
    {
      success: true,
      retry_enqueued: retryEnqueued,
      expo_ticket_errors: expoTicketErrors,
      token_cleared: tokenCleared,
    },
    200,
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return respondJson({ error: 'Method not allowed' }, 405);
  }

  // Verify the request is authenticated with service role
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return respondJson({ error: 'Missing authorization' }, 401);
  }

  const token = authHeader.substring(7);

  // Database webhooks from pg_net include the user-agent header
  const userAgent = req.headers.get('User-Agent') ?? '';
  const isFromPgNet = userAgent.startsWith('pg_net/');

  // If JWT secret is configured, verify the token cryptographically
  // Otherwise, for pg_net webhooks, decode and check the role claim without verification
  // This is safe because pg_net requests originate from within Supabase's infrastructure
  if (supabaseJwtSecret) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(supabaseJwtSecret), {
        algorithms: ['HS256'],
      });
      const role = typeof payload.role === 'string' ? payload.role : null;

      if (role !== 'service_role') {
        return respondJson({ error: 'Insufficient permissions' }, 403);
      }
    } catch (error) {
      console.error('[send-push] Token verification failed', { error });
      return respondJson({ error: 'Invalid or expired token' }, 401);
    }
  } else if (isFromPgNet) {
    // For pg_net requests without JWT secret, decode token without verification
    // pg_net requests come from Supabase's internal infrastructure
    try {
      const [, payloadB64] = token.split('.');
      if (!payloadB64) {
        return respondJson({ error: 'Invalid token format' }, 401);
      }
      const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson) as { role?: string };

      if (payload.role !== 'service_role') {
        return respondJson({ error: 'Insufficient permissions' }, 403);
      }
      console.info('[send-push] Authenticated via pg_net with service_role');
    } catch (error) {
      console.error('[send-push] Token decode failed', { error });
      return respondJson({ error: 'Invalid token' }, 401);
    }
  } else {
    // No JWT secret and not from pg_net - require proper configuration
    console.error('[send-push] SUPABASE_JWT_SECRET not configured and request is not from pg_net');
    return respondJson({ error: 'Server misconfigured' }, 500);
  }

  const workerRun = await beginBackendWorkerRun(supabaseAdmin, {
    workerName: 'push_retry_processing',
    source: parseSource(req),
  });

  try {
    const response = await handleRequest(req);
    const payload = await readPushRunPayload(response);
    await completeBackendWorkerRun(supabaseAdmin, workerRun, {
      status: pushRunStatus(response, payload),
      counts: pushRunCounts(payload),
      error: payload.error ?? null,
      metadata: {
        skipped: payload.skipped ?? null,
      },
    });
    return response;
  } catch (error) {
    await completeBackendWorkerRun(supabaseAdmin, workerRun, {
      status: 'failed',
      counts: {
        notifications_sent: 0,
        notifications_skipped: 0,
        errors: 1,
        retries_enqueued: 0,
        expo_ticket_errors: 0,
        tokens_cleared: 0,
      },
      error,
      metadata: {
        skipped: null,
      },
    });
    return respondJson({ error: formatErrorMessage(error) }, 500);
  }
});
