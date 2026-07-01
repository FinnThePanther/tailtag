/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions resolve Supabase JS through Deno npm imports.
import { createClient } from 'npm:@supabase/supabase-js@2.45.1';
import {
  beginBackendWorkerRun,
  completeBackendWorkerRun,
  completeOrHeartbeatBackendWorkerRun,
  type BackendWorkerRunStatus,
} from '../_shared/backendWorkerRuns.ts';
import { verifyHs256Jwt } from '../_shared/serviceRoleJwt.ts';

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

const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const DEFAULT_MAX_RECEIPTS = 100;
const MAX_RECEIPTS = 1000;
const DEFAULT_MAX_DURATION_MS = 10_000;
const MAX_DURATION_MS = 30_000;
const MISSING_RECEIPT_RETRY_SECONDS = 300;

type ReceiptCompletionStatus = 'ok' | 'error' | 'retry_pending' | 'expired' | 'failed';

interface WorkerRequestBody {
  maxReceipts?: unknown;
  maxDurationMs?: unknown;
  source?: unknown;
}

interface ReceiptRow {
  id: string;
  job_id: string;
  attempt_id: string;
  notification_id: string;
  user_id: string;
  expo_ticket_id: string;
  expo_push_token: string;
  attempt_number: number;
  max_attempts: number;
  expires_at: string;
}

interface ExpoReceipt {
  status?: string;
  message?: string;
  details?: {
    error?: string;
    [key: string]: unknown;
  };
}

interface ExpoReceiptResponse {
  data?: Record<string, ExpoReceipt>;
  errors?: Array<{
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  }>;
}

interface ReceiptCompletionResult {
  status: ReceiptCompletionStatus;
  errorMessage?: string | null;
  responseStatus?: number | null;
  responseBody?: ExpoReceiptResponse | null;
  receiptBody?: Record<string, unknown> | null;
  expoError?: string | null;
  expoMessage?: string | null;
  retryAfterSeconds?: number | null;
  tokenCleared?: boolean;
}

interface ReceiptRunPayload {
  success?: boolean;
  error?: string;
  receipts_claimed?: number;
  receipts_ok?: number;
  receipts_error?: number;
  receipts_missing?: number;
  receipts_retry_pending?: number;
  receipts_expired?: number;
  receipts_failed?: number;
  tokens_cleared?: number;
  errors?: number;
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
  return Math.min(300 * 2 ** Math.max(attemptNumber - 1, 0), 3600);
}

function remainingBudgetMs(deadlineAt: number): number {
  return Math.max(1, deadlineAt - Date.now());
}

function isExpired(row: ReceiptRow): boolean {
  const expiresAtMs = new Date(row.expires_at).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
}

function receiptBody(receipt: ExpoReceipt): Record<string, unknown> {
  return JSON.parse(JSON.stringify(receipt)) as Record<string, unknown>;
}

async function parseBody(req: Request): Promise<WorkerRequestBody> {
  const bodyText = await req.text();
  if (bodyText.trim().length === 0) {
    return {};
  }
  return JSON.parse(bodyText) as WorkerRequestBody;
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

async function claimReceipts(workerId: string, limit: number): Promise<ReceiptRow[]> {
  const { data, error } = await supabaseAdmin.rpc('claim_notification_push_receipts', {
    p_worker_id: workerId,
    p_limit: limit,
  });

  if (error) {
    throw new Error(`Failed to claim push receipts: ${error.message}`);
  }

  return (data ?? []) as ReceiptRow[];
}

async function completeReceipt(
  row: ReceiptRow,
  workerId: string,
  result: ReceiptCompletionResult,
): Promise<ReceiptCompletionStatus> {
  const { data, error } = await supabaseAdmin.rpc('complete_notification_push_receipt', {
    p_receipt_id: row.id,
    p_worker_id: workerId,
    p_result_status: result.status,
    p_error_message: result.errorMessage ?? null,
    p_response_status: result.responseStatus ?? null,
    p_response_body: result.responseBody ?? null,
    p_receipt_body: result.receiptBody ?? null,
    p_expo_error: result.expoError ?? null,
    p_expo_message: result.expoMessage ?? null,
    p_retry_after_seconds: result.retryAfterSeconds ?? null,
    p_token_cleared: result.tokenCleared ?? false,
  });

  if (error) {
    throw new Error(`Failed to complete push receipt ${row.id}: ${error.message}`);
  }

  return (extractString(data) as ReceiptCompletionStatus | null) ?? result.status;
}

async function clearPushToken(userId: string, expoPushToken: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({
      expo_push_token: null,
      push_notifications_enabled: false,
    })
    .eq('id', userId)
    .eq('expo_push_token', expoPushToken)
    .select('id');

  if (error) {
    console.error('[process-push-receipts] Failed clearing invalid token', { userId, error });
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

function updateStatusCounts(
  counts: Required<
    Pick<
      ReceiptRunPayload,
      | 'receipts_ok'
      | 'receipts_error'
      | 'receipts_retry_pending'
      | 'receipts_expired'
      | 'receipts_failed'
      | 'errors'
    >
  >,
  status: ReceiptCompletionStatus,
) {
  switch (status) {
    case 'ok':
      counts.receipts_ok += 1;
      break;
    case 'error':
      counts.receipts_error += 1;
      counts.errors += 1;
      break;
    case 'retry_pending':
      counts.receipts_retry_pending += 1;
      break;
    case 'expired':
      counts.receipts_expired += 1;
      counts.errors += 1;
      break;
    case 'failed':
      counts.receipts_failed += 1;
      counts.errors += 1;
      break;
  }
}

function expoRequestErrorMessage(responseJson: ExpoReceiptResponse | null): string {
  const errors = responseJson?.errors ?? [];
  if (errors.length === 0) {
    return 'Expo receipt request failed';
  }
  return errors.map((error) => error.code ?? error.message ?? 'ExpoRequestError').join(', ');
}

function hasRetryableExpoRequestError(responseJson: ExpoReceiptResponse | null): boolean {
  return (responseJson?.errors ?? []).some((error) => error.code === 'TOO_MANY_REQUESTS');
}

async function fetchExpoReceipts(
  rows: ReceiptRow[],
  deadlineAt: number,
): Promise<{
  responseStatus: number;
  responseBody: ExpoReceiptResponse | null;
  retryAfterSeconds: number | null;
}> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (expoAccessToken) {
    headers.Authorization = `Bearer ${expoAccessToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), remainingBudgetMs(deadlineAt));

  try {
    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ids: rows.map((row) => row.expo_ticket_id),
      }),
      signal: controller.signal,
    });

    let responseJson: ExpoReceiptResponse | null = null;
    try {
      responseJson = (await response.json()) as ExpoReceiptResponse;
    } catch (parseError) {
      console.error('[process-push-receipts] Failed parsing Expo receipt response', {
        parseError,
      });
      throw new Error(
        `Failed to parse Expo receipt response (${response.status}): ${formatErrorMessage(parseError)}`,
      );
    }

    return {
      responseStatus: response.status,
      responseBody: responseJson,
      retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('Retry-After')),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function completeRequestFailure(
  rows: ReceiptRow[],
  workerId: string,
  counts: Required<
    Pick<
      ReceiptRunPayload,
      | 'receipts_ok'
      | 'receipts_error'
      | 'receipts_retry_pending'
      | 'receipts_expired'
      | 'receipts_failed'
      | 'errors'
    >
  >,
  result: ReceiptCompletionResult,
) {
  for (const row of rows) {
    const finalStatus = await completeReceipt(row, workerId, result);
    updateStatusCounts(counts, finalStatus);
    if (finalStatus === 'retry_pending') {
      counts.errors += 1;
    }
  }
}

async function processReceiptBatch(
  rows: ReceiptRow[],
  workerId: string,
  deadlineAt: number,
  counts: Required<
    Pick<
      ReceiptRunPayload,
      | 'receipts_ok'
      | 'receipts_error'
      | 'receipts_missing'
      | 'receipts_retry_pending'
      | 'receipts_expired'
      | 'receipts_failed'
      | 'tokens_cleared'
      | 'errors'
    >
  >,
) {
  const rowsToFetch: ReceiptRow[] = [];

  for (const row of rows) {
    if (isExpired(row)) {
      const finalStatus = await completeReceipt(row, workerId, {
        status: 'expired',
        errorMessage: 'Expo receipt window expired',
      });
      updateStatusCounts(counts, finalStatus);
    } else {
      rowsToFetch.push(row);
    }
  }

  if (rowsToFetch.length === 0) {
    return;
  }

  let expoResponse: {
    responseStatus: number;
    responseBody: ExpoReceiptResponse | null;
    retryAfterSeconds: number | null;
  };

  try {
    expoResponse = await fetchExpoReceipts(rowsToFetch, deadlineAt);
  } catch (error) {
    const errorMessage = formatErrorMessage(error);
    console.error('[process-push-receipts] Expo receipt request failed', { error });
    await completeRequestFailure(rowsToFetch, workerId, counts, {
      status: 'retry_pending',
      errorMessage,
      retryAfterSeconds: retryDelaySeconds(rowsToFetch[0]?.attempt_number ?? 1),
    });
    return;
  }

  const { responseStatus, responseBody, retryAfterSeconds } = expoResponse;
  if (responseStatus === 429 || responseStatus >= 500) {
    await completeRequestFailure(rowsToFetch, workerId, counts, {
      status: 'retry_pending',
      errorMessage: `Expo receipt request responded with status ${responseStatus}`,
      responseStatus,
      responseBody,
      retryAfterSeconds:
        retryAfterSeconds ?? retryDelaySeconds(rowsToFetch[0]?.attempt_number ?? 1),
    });
    return;
  }

  if (responseStatus < 200 || responseStatus >= 300) {
    await completeRequestFailure(rowsToFetch, workerId, counts, {
      status: 'failed',
      errorMessage: `Expo receipt request responded with status ${responseStatus}`,
      responseStatus,
      responseBody,
    });
    return;
  }

  if ((responseBody?.errors ?? []).length > 0) {
    const retryable = hasRetryableExpoRequestError(responseBody);
    await completeRequestFailure(rowsToFetch, workerId, counts, {
      status: retryable ? 'retry_pending' : 'failed',
      errorMessage: expoRequestErrorMessage(responseBody),
      responseStatus,
      responseBody,
      retryAfterSeconds: retryable
        ? (retryAfterSeconds ?? retryDelaySeconds(rowsToFetch[0]?.attempt_number ?? 1))
        : null,
    });
    return;
  }

  const receiptMap = responseBody?.data ?? {};
  for (const row of rowsToFetch) {
    const receipt = receiptMap[row.expo_ticket_id];

    if (!receipt) {
      if (isExpired(row)) {
        const finalStatus = await completeReceipt(row, workerId, {
          status: 'expired',
          errorMessage: 'Expo receipt window expired',
          responseStatus,
          responseBody,
        });
        updateStatusCounts(counts, finalStatus);
        continue;
      }

      counts.receipts_missing += 1;
      const finalStatus = await completeReceipt(row, workerId, {
        status: 'retry_pending',
        errorMessage: 'Expo receipt not available yet',
        responseStatus,
        responseBody,
        retryAfterSeconds: MISSING_RECEIPT_RETRY_SECONDS,
      });
      updateStatusCounts(counts, finalStatus);
      continue;
    }

    const status = extractString(receipt.status);
    if (status === 'ok') {
      const finalStatus = await completeReceipt(row, workerId, {
        status: 'ok',
        responseStatus,
        responseBody,
        receiptBody: receiptBody(receipt),
      });
      updateStatusCounts(counts, finalStatus);
      continue;
    }

    if (status === 'error') {
      const expoError = extractString(receipt.details?.error);
      const expoMessage = extractString(receipt.message);
      let tokenCleared = false;

      if (expoError === 'DeviceNotRegistered') {
        tokenCleared = await clearPushToken(row.user_id, row.expo_push_token);
        counts.tokens_cleared += tokenCleared ? 1 : 0;
      }

      const finalStatus = await completeReceipt(row, workerId, {
        status: 'error',
        errorMessage: expoError ?? expoMessage ?? 'Expo receipt error',
        responseStatus,
        responseBody,
        receiptBody: receiptBody(receipt),
        expoError,
        expoMessage,
        tokenCleared,
      });
      updateStatusCounts(counts, finalStatus);
      continue;
    }

    const finalStatus = await completeReceipt(row, workerId, {
      status: 'failed',
      errorMessage: status
        ? `Unknown Expo receipt status: ${status}`
        : 'Missing Expo receipt status',
      responseStatus,
      responseBody,
      receiptBody: receiptBody(receipt),
    });
    updateStatusCounts(counts, finalStatus);
  }
}

async function handleRequest(body: WorkerRequestBody): Promise<Response> {
  const maxReceipts = parsePositiveInteger(body.maxReceipts, DEFAULT_MAX_RECEIPTS, MAX_RECEIPTS);
  const maxDurationMs = parsePositiveInteger(
    body.maxDurationMs,
    DEFAULT_MAX_DURATION_MS,
    MAX_DURATION_MS,
  );
  const workerId = crypto.randomUUID();
  const deadlineAt = Date.now() + maxDurationMs;

  const counts: Required<
    Pick<
      ReceiptRunPayload,
      | 'receipts_claimed'
      | 'receipts_ok'
      | 'receipts_error'
      | 'receipts_missing'
      | 'receipts_retry_pending'
      | 'receipts_expired'
      | 'receipts_failed'
      | 'tokens_cleared'
      | 'errors'
    >
  > = {
    receipts_claimed: 0,
    receipts_ok: 0,
    receipts_error: 0,
    receipts_missing: 0,
    receipts_retry_pending: 0,
    receipts_expired: 0,
    receipts_failed: 0,
    tokens_cleared: 0,
    errors: 0,
  };

  while (counts.receipts_claimed < maxReceipts && Date.now() < deadlineAt) {
    const limit = Math.min(maxReceipts - counts.receipts_claimed, MAX_RECEIPTS);
    const rows = await claimReceipts(workerId, limit);
    if (rows.length === 0) {
      break;
    }

    counts.receipts_claimed += rows.length;
    await processReceiptBatch(rows, workerId, deadlineAt, counts);
  }

  return respondJson({
    success: true,
    ...counts,
  });
}

async function readReceiptRunPayload(response: Response): Promise<ReceiptRunPayload> {
  try {
    const payload = await response.clone().json();
    return toRecord(payload) as ReceiptRunPayload;
  } catch {
    return {};
  }
}

function receiptRunStatus(response: Response, payload: ReceiptRunPayload): BackendWorkerRunStatus {
  if (response.status >= 500) {
    return 'failed';
  }
  if (
    payload.error ||
    (payload.errors ?? 0) > 0 ||
    (payload.receipts_error ?? 0) > 0 ||
    (payload.receipts_expired ?? 0) > 0 ||
    (payload.receipts_failed ?? 0) > 0
  ) {
    return 'partial';
  }
  return 'succeeded';
}

function receiptRunCounts(payload: ReceiptRunPayload): Record<string, number> {
  return {
    receipts_claimed: payload.receipts_claimed ?? 0,
    receipts_ok: payload.receipts_ok ?? 0,
    receipts_error: payload.receipts_error ?? 0,
    receipts_missing: payload.receipts_missing ?? 0,
    receipts_retry_pending: payload.receipts_retry_pending ?? 0,
    receipts_expired: payload.receipts_expired ?? 0,
    receipts_failed: payload.receipts_failed ?? 0,
    tokens_cleared: payload.tokens_cleared ?? 0,
    errors: payload.errors ?? (payload.error ? 1 : 0),
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
      console.error('[process-push-receipts] Token verification failed', { error });
      return respondJson({ error: 'Invalid or expired token' }, 401);
    }
  } else if (token !== serviceRoleKey) {
    console.error(
      '[process-push-receipts] SUPABASE_JWT_SECRET not configured and token is not service role key',
    );
    return respondJson({ error: 'Invalid or expired token' }, 401);
  } else {
    console.info('[process-push-receipts] Authenticated with exact service role key');
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
    workerName: 'push_receipt_polling',
    source: parseSource(req, body),
  });

  try {
    const response = await handleRequest(body);
    const payload = await readReceiptRunPayload(response);
    await completeOrHeartbeatBackendWorkerRun(supabaseAdmin, workerRun, {
      status: receiptRunStatus(response, payload),
      counts: receiptRunCounts(payload),
      error: payload.error ?? null,
    });
    return response;
  } catch (error) {
    await completeBackendWorkerRun(supabaseAdmin, workerRun, {
      status: 'failed',
      counts: {
        receipts_claimed: 0,
        receipts_ok: 0,
        receipts_error: 0,
        receipts_missing: 0,
        receipts_retry_pending: 0,
        receipts_expired: 0,
        receipts_failed: 0,
        tokens_cleared: 0,
        errors: 1,
      },
      error,
    });
    return respondJson({ error: formatErrorMessage(error) }, 500);
  }
});
