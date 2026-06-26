/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions use remote imports.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import {
  beginBackendWorkerRun,
  completeBackendWorkerRun,
  completeOrHeartbeatBackendWorkerRun,
  type BackendWorkerRunStatus,
} from '../_shared/backendWorkerRuns.ts';
import { verifyHs256Jwt } from '../_shared/serviceRoleJwt.ts';
import {
  isInAppOnlyNotificationType,
  isPushNotificationType,
} from '../../../packages/notification-contract/src/index.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
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
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const DEFAULT_MAX_DURATION_MS = 10_000;
const TARGETED_MAX_DURATION_MS = 2_500;

interface NotificationRecord {
  id?: unknown;
  user_id?: unknown;
  type?: unknown;
  payload?: unknown;
}

interface WorkerRequestBody {
  notification_id?: unknown;
  notificationId?: unknown;
  maxJobs?: unknown;
  maxDurationMs?: unknown;
  source?: unknown;
  record?: NotificationRecord;
}

interface ExpoPushResponse {
  data?:
    | {
        status?: string;
        id?: string;
        message?: string;
        details?: { error?: string };
      }
    | Array<{
        status?: string;
        id?: string;
        message?: string;
        details?: { error?: string };
      }>;
  errors?: Array<{ code?: string; message?: string }>;
}

interface PushJobRow {
  id: string;
  notification_id: string;
  user_id: string;
  notification_type: string;
  payload: Record<string, unknown> | null;
  attempt_number: number;
  max_attempts: number;
}

type DeliveryStatus = 'sent' | 'skipped' | 'retry_pending' | 'failed';

interface DeliveryResult {
  status: DeliveryStatus;
  errorMessage?: string | null;
  skipReason?: string | null;
  responseStatus?: number | null;
  responseBody?: ExpoPushResponse | null;
  requestSnapshot?: Record<string, unknown> | null;
  retryAfterSeconds?: number | null;
  expoTicketId?: string | null;
  expoPushToken?: string | null;
  expoTicketErrors?: number;
  tokenCleared?: boolean;
}

interface PushRunPayload {
  success?: boolean;
  error?: string;
  jobs_claimed?: number;
  jobs_sent?: number;
  jobs_skipped?: number;
  jobs_retry_pending?: number;
  jobs_failed?: number;
  notifications_sent?: number;
  notifications_skipped?: number;
  errors?: number;
  expo_ticket_errors?: number;
  tokens_cleared?: number;
}

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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parsePositiveInteger(value: unknown, fallback: number, max: number): number {
  let parsed: number | null = null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    parsed = Math.trunc(value);
  } else if (typeof value === 'string') {
    const candidate = Number.parseInt(value, 10);
    if (Number.isFinite(candidate)) {
      parsed = candidate;
    }
  }

  if (!parsed || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
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
    case 'convention_finalizing_started': {
      const conventionName = extractString(payload.convention_name) ?? 'convention';
      return {
        title: `Finish your ${conventionName} catches`,
        body: `${conventionName} has ended. Review pending catches and add any final gallery catches before your recap is prepared.`,
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
    case 'daily_task_completed': {
      const taskName = extractString(payload.task_name);
      return {
        title: 'Daily task complete',
        body: taskName ? `Completed: ${taskName}` : 'You completed a daily task.',
      };
    }
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

async function clearPushToken(userId: string, expoPushToken: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      expo_push_token: null,
      push_notifications_enabled: false,
    })
    .eq('id', userId)
    .eq('expo_push_token', expoPushToken);

  if (error) {
    console.error('[send-push] Failed clearing invalid token', { userId, error });
    return false;
  }
  return true;
}

function extractExpoErrors(responseJson: ExpoPushResponse): string[] {
  const results = responseJson?.data;
  const entries = Array.isArray(results) ? results : results ? [results] : [];
  const errors: string[] = [];

  for (const entry of entries) {
    if (entry?.status === 'error') {
      errors.push(entry?.details?.error ?? entry?.message ?? 'ExpoTicketError');
    }
  }

  for (const error of responseJson.errors ?? []) {
    errors.push(error.code ?? error.message ?? 'ExpoRequestError');
  }

  return errors;
}

function extractExpoTicketId(responseJson: ExpoPushResponse): string | null {
  const results = responseJson?.data;
  const entries = Array.isArray(results) ? results : results ? [results] : [];

  for (const entry of entries) {
    const ticketId = extractString(entry?.id);
    if (entry?.status === 'ok' && ticketId) {
      return ticketId;
    }
  }

  return null;
}

function parseRetryAfterSeconds(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds, 3600);
  }
  return null;
}

function retryDelaySeconds(attemptNumber: number, retryAfterHeader: string | null = null): number {
  const headerDelay = parseRetryAfterSeconds(retryAfterHeader);
  if (headerDelay) {
    return headerDelay;
  }
  return Math.min(60 * 2 ** Math.max(attemptNumber - 1, 0), 3600);
}

function redactedRequestSnapshot(requestBody: Record<string, unknown>): Record<string, unknown> {
  const { to: _to, ...rest } = requestBody;
  return {
    ...rest,
    token_present: typeof requestBody.to === 'string' && requestBody.to.length > 0,
  };
}

function remainingBudgetMs(deadlineAt: number): number {
  return Math.max(1, deadlineAt - Date.now());
}

async function ensureNotificationPushJob(notificationId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('enqueue_notification_push_job', {
    p_notification_id: notificationId,
  });

  if (error) {
    throw new Error(`Failed to enqueue push job: ${error.message}`);
  }
}

async function claimNextJob(
  workerId: string,
  notificationId: string | null,
): Promise<PushJobRow | null> {
  const { data, error } = await supabaseAdmin.rpc('claim_notification_push_jobs', {
    p_worker_id: workerId,
    p_limit: 1,
    p_notification_id: notificationId,
  });

  if (error) {
    throw new Error(`Failed to claim push job: ${error.message}`);
  }

  const rows = (data ?? []) as PushJobRow[];
  return rows[0] ?? null;
}

async function completePushJob(
  job: PushJobRow,
  workerId: string,
  result: DeliveryResult,
): Promise<DeliveryStatus> {
  const { data, error } = await supabaseAdmin.rpc('complete_notification_push_job', {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_result_status: result.status,
    p_error_message: result.errorMessage ?? null,
    p_response_status: result.responseStatus ?? null,
    p_response_body: result.responseBody ?? null,
    p_request_snapshot: result.requestSnapshot ?? null,
    p_skip_reason: result.skipReason ?? null,
    p_retry_after_seconds: result.retryAfterSeconds ?? null,
    p_expo_ticket_id: result.expoTicketId ?? null,
    p_expo_push_token: result.expoPushToken ?? null,
  });

  if (error) {
    throw new Error(`Failed to complete push job ${job.id}: ${error.message}`);
  }

  return (extractString(data) as DeliveryStatus | null) ?? result.status;
}

async function deliverPushJob(job: PushJobRow, fetchDeadlineAt: number): Promise<DeliveryResult> {
  const notificationType = extractString(job.notification_type);
  if (!notificationType) {
    return { status: 'skipped', skipReason: 'Missing notification type' };
  }

  if (isInAppOnlyNotificationType(notificationType)) {
    return { status: 'skipped', skipReason: 'In-app-only type' };
  }

  if (!isPushNotificationType(notificationType)) {
    return { status: 'skipped', skipReason: 'Unhandled type' };
  }

  const payload = toRecord(job.payload);
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('expo_push_token, push_notifications_enabled')
    .eq('id', job.user_id)
    .maybeSingle();

  if (profileError) {
    console.error('[send-push] Failed fetching profile', {
      userId: job.user_id,
      error: profileError,
    });
    return {
      status: 'retry_pending',
      errorMessage: `Profile fetch failed: ${profileError.message}`,
      retryAfterSeconds: retryDelaySeconds(job.attempt_number),
    };
  }

  if (!profile) {
    return { status: 'skipped', skipReason: 'Profile not found' };
  }

  if (!profile.push_notifications_enabled || !profile.expo_push_token) {
    return { status: 'skipped', skipReason: 'Push disabled or missing token' };
  }

  const message = await buildMessage(notificationType, payload);
  if (!message) {
    return { status: 'skipped', skipReason: 'No message template' };
  }

  const requestBody = {
    to: profile.expo_push_token,
    title: message.title,
    body: message.body,
    data: {
      ...payload,
      type: notificationType,
      notification_id: job.notification_id,
    },
    sound: 'default',
    priority: 'default',
    channelId: 'default',
  };
  const requestSnapshot = redactedRequestSnapshot(requestBody);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (expoAccessToken) {
    headers.Authorization = `Bearer ${expoAccessToken}`;
  }

  let responseJson: ExpoPushResponse | null = null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), remainingBudgetMs(fetchDeadlineAt));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    try {
      responseJson = (await response.json()) as ExpoPushResponse;
    } catch (parseError) {
      console.error('[send-push] Failed parsing Expo response', { parseError });
      throw parseError;
    }

    if (!response.ok) {
      const errorMessage = `Expo responded with status ${response.status}`;
      console.error('[send-push] Expo push failed', {
        status: response.status,
        response: responseJson,
        notificationId: job.notification_id,
      });

      const retryable = response.status === 429 || response.status >= 500;
      return {
        status: retryable ? 'retry_pending' : 'failed',
        errorMessage,
        responseStatus: response.status,
        responseBody: responseJson,
        requestSnapshot,
        retryAfterSeconds: retryable
          ? retryDelaySeconds(job.attempt_number, response.headers.get('Retry-After'))
          : null,
      };
    }
  } catch (error) {
    const errorMessage = formatErrorMessage(error);
    console.error('[send-push] Expo push request failed', {
      error,
      notificationId: job.notification_id,
    });
    return {
      status: 'retry_pending',
      errorMessage,
      requestSnapshot,
      retryAfterSeconds: retryDelaySeconds(job.attempt_number),
    };
  } finally {
    clearTimeout(timeoutId);
  }

  if (responseJson) {
    const expoErrors = extractExpoErrors(responseJson);
    if (expoErrors.length > 0) {
      console.error('[send-push] Expo ticket errors', {
        expoErrors,
        response: responseJson,
        notificationId: job.notification_id,
      });

      if (expoErrors.includes('DeviceNotRegistered')) {
        const tokenCleared = await clearPushToken(job.user_id, profile.expo_push_token);
        return {
          status: 'skipped',
          skipReason: 'DeviceNotRegistered',
          responseStatus: 200,
          responseBody: responseJson,
          requestSnapshot,
          expoTicketErrors: expoErrors.length,
          tokenCleared,
        };
      }

      return {
        status: 'failed',
        errorMessage: `Expo ticket errors: ${expoErrors.join(', ')}`,
        responseStatus: 200,
        responseBody: responseJson,
        requestSnapshot,
        expoTicketErrors: expoErrors.length,
      };
    }

    const expoTicketId = extractExpoTicketId(responseJson);
    if (!expoTicketId) {
      return {
        status: 'failed',
        errorMessage: 'Expo response missing ticket id',
        responseStatus: 200,
        responseBody: responseJson,
        requestSnapshot,
      };
    }

    return {
      status: 'sent',
      responseStatus: 200,
      responseBody: responseJson,
      requestSnapshot,
      expoTicketId,
      expoPushToken: profile.expo_push_token,
    };
  }

  return {
    status: 'failed',
    errorMessage: 'Expo response missing body',
    responseStatus: 200,
    responseBody: responseJson,
    requestSnapshot,
  };
}

async function parseBody(req: Request): Promise<WorkerRequestBody> {
  const bodyText = await req.text();
  if (bodyText.trim().length === 0) {
    return {};
  }
  return JSON.parse(bodyText) as WorkerRequestBody;
}

function notificationIdFromBody(body: WorkerRequestBody): string | null {
  const directId = extractString(body.notification_id) ?? extractString(body.notificationId);
  if (directId) {
    return directId;
  }

  return extractString(toRecord(body.record).id);
}

function parseSource(req: Request, body: WorkerRequestBody): string {
  const bodySource = extractString(body.source);
  if (bodySource) {
    return bodySource;
  }

  const url = new URL(req.url);
  const querySource = extractString(url.searchParams.get('source'));
  if (querySource) {
    return querySource;
  }

  const userAgent = req.headers.get('User-Agent') ?? '';
  if (userAgent.startsWith('pg_net/')) {
    return 'pg_net_webhook';
  }

  return 'manual';
}

async function handleRequest(body: WorkerRequestBody): Promise<Response> {
  const notificationId = notificationIdFromBody(body);
  if (notificationId && !isUuid(notificationId)) {
    return respondJson({ error: 'Invalid notification_id' }, 400);
  }

  const targeted = Boolean(notificationId);
  if (notificationId) {
    await ensureNotificationPushJob(notificationId);
  }

  const maxJobs = targeted
    ? 1
    : parsePositiveInteger(body.maxJobs, DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);
  const maxDurationMs = parsePositiveInteger(
    body.maxDurationMs,
    targeted ? TARGETED_MAX_DURATION_MS : DEFAULT_MAX_DURATION_MS,
    30_000,
  );
  const workerId = crypto.randomUUID();
  const startedAt = Date.now();
  const deadlineAt = startedAt + maxDurationMs;

  const counts: Required<
    Pick<
      PushRunPayload,
      | 'jobs_claimed'
      | 'jobs_sent'
      | 'jobs_skipped'
      | 'jobs_retry_pending'
      | 'jobs_failed'
      | 'notifications_sent'
      | 'notifications_skipped'
      | 'errors'
      | 'expo_ticket_errors'
      | 'tokens_cleared'
    >
  > = {
    jobs_claimed: 0,
    jobs_sent: 0,
    jobs_skipped: 0,
    jobs_retry_pending: 0,
    jobs_failed: 0,
    notifications_sent: 0,
    notifications_skipped: 0,
    errors: 0,
    expo_ticket_errors: 0,
    tokens_cleared: 0,
  };

  while (counts.jobs_claimed < maxJobs && Date.now() < deadlineAt) {
    const job = await claimNextJob(workerId, notificationId);
    if (!job) {
      break;
    }

    counts.jobs_claimed += 1;

    let result: DeliveryResult;
    try {
      result = await deliverPushJob(job, deadlineAt);
    } catch (error) {
      result = {
        status: 'retry_pending',
        errorMessage: formatErrorMessage(error),
        retryAfterSeconds: retryDelaySeconds(job.attempt_number),
      };
    }

    const finalStatus = await completePushJob(job, workerId, result);
    counts.expo_ticket_errors += result.expoTicketErrors ?? 0;
    counts.tokens_cleared += result.tokenCleared ? 1 : 0;

    switch (finalStatus) {
      case 'sent':
        counts.jobs_sent += 1;
        counts.notifications_sent += 1;
        break;
      case 'skipped':
        counts.jobs_skipped += 1;
        counts.notifications_skipped += 1;
        break;
      case 'retry_pending':
        counts.jobs_retry_pending += 1;
        break;
      case 'failed':
        counts.jobs_failed += 1;
        counts.errors += 1;
        break;
    }

    if (targeted) {
      break;
    }
  }

  return respondJson({
    success: true,
    ...counts,
  });
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
  if (
    payload.error ||
    (payload.errors ?? 0) > 0 ||
    (payload.jobs_failed ?? 0) > 0 ||
    (payload.jobs_retry_pending ?? 0) > 0 ||
    (payload.expo_ticket_errors ?? 0) > 0
  ) {
    return 'partial';
  }
  return 'succeeded';
}

function pushRunCounts(payload: PushRunPayload): Record<string, number> {
  return {
    jobs_claimed: payload.jobs_claimed ?? 0,
    jobs_sent: payload.jobs_sent ?? 0,
    jobs_skipped: payload.jobs_skipped ?? 0,
    jobs_retry_pending: payload.jobs_retry_pending ?? 0,
    jobs_failed: payload.jobs_failed ?? 0,
    notifications_sent: payload.notifications_sent ?? 0,
    notifications_skipped: payload.notifications_skipped ?? 0,
    errors: payload.errors ?? (payload.error ? 1 : 0),
    expo_ticket_errors: payload.expo_ticket_errors ?? 0,
    tokens_cleared: payload.tokens_cleared ?? 0,
  };
}

async function verifyServiceRoleRequest(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return respondJson({ error: 'Missing authorization' }, 401);
  }

  const token = authHeader.substring(7);

  if (supabaseJwtSecret) {
    try {
      const payload = await verifyHs256Jwt(token, supabaseJwtSecret);
      const role = typeof payload?.role === 'string' ? payload.role : null;

      if (role !== 'service_role') {
        return respondJson({ error: 'Insufficient permissions' }, 403);
      }
    } catch (error) {
      console.error('[send-push] Token verification failed', { error });
      return respondJson({ error: 'Invalid or expired token' }, 401);
    }
  } else if (token !== serviceRoleKey) {
    console.error(
      '[send-push] SUPABASE_JWT_SECRET not configured and token is not service role key',
    );
    return respondJson({ error: 'Invalid or expired token' }, 401);
  } else {
    console.info('[send-push] Authenticated with exact service role key');
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return respondJson({ error: 'Method not allowed' }, 405);
  }

  const authError = await verifyServiceRoleRequest(req);
  if (authError) {
    return authError;
  }

  let body: WorkerRequestBody;
  try {
    body = await parseBody(req);
  } catch {
    return respondJson({ error: 'Invalid JSON payload' }, 400);
  }

  const workerRun = await beginBackendWorkerRun(supabaseAdmin, {
    workerName: 'push_delivery',
    source: parseSource(req, body),
  });

  try {
    const response = await handleRequest(body);
    const payload = await readPushRunPayload(response);
    await completeOrHeartbeatBackendWorkerRun(supabaseAdmin, workerRun, {
      status: pushRunStatus(response, payload),
      counts: pushRunCounts(payload),
      error: payload.error ?? null,
      metadata: {
        notification_id: notificationIdFromBody(body),
      },
    });
    return response;
  } catch (error) {
    await completeBackendWorkerRun(supabaseAdmin, workerRun, {
      status: 'failed',
      counts: {
        jobs_claimed: 0,
        jobs_sent: 0,
        jobs_skipped: 0,
        jobs_retry_pending: 0,
        jobs_failed: 0,
        notifications_sent: 0,
        notifications_skipped: 0,
        errors: 1,
        expo_ticket_errors: 0,
        tokens_cleared: 0,
      },
      error,
      metadata: {
        notification_id: notificationIdFromBody(body),
      },
    });
    return respondJson({ error: formatErrorMessage(error) }, 500);
  }
});
