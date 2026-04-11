// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions run in Deno.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import type { Json } from './types.ts';

export const GAMEPLAY_QUEUE_NAME = 'gameplay_event_processing';

const CONFIG_NAMES = [
  'gameplay_queue_enabled',
  'gameplay_queue_wakeup_enabled',
  'gameplay_inline_processing_enabled',
  'gameplay_queue_batch_size',
  'gameplay_queue_visibility_timeout_seconds',
  'gameplay_queue_max_attempts',
  'gameplay_queue_wakeup_max_messages',
  'gameplay_queue_wakeup_max_duration_ms',
] as const;

export type GameplayQueueConfig = {
  queueEnabled: boolean;
  wakeupEnabled: boolean;
  inlineProcessingEnabled: boolean;
  batchSize: number;
  visibilityTimeoutSeconds: number;
  maxAttempts: number;
  wakeupMaxMessages: number;
  wakeupMaxDurationMs: number;
};

export type IngestGameplayEventParams = {
  type: string;
  userId: string;
  conventionId?: string | null;
  payload?: Json | null;
  occurredAt?: string | null;
  idempotencyKey?: string | null;
};

type EdgeFunctionConfigRow = {
  function_name: string;
  config: unknown;
};

type IngestGameplayEventRow = {
  event_id: string;
  duplicate: boolean;
  enqueued: boolean;
};

type DrainGameplayQueueOptions = {
  supabaseUrl: string;
  serviceRoleKey: string;
  maxMessages?: number;
  maxDurationMs?: number;
};

const DEFAULT_GAMEPLAY_QUEUE_CONFIG: GameplayQueueConfig = {
  queueEnabled: true,
  wakeupEnabled: true,
  inlineProcessingEnabled: false,
  batchSize: 25,
  visibilityTimeoutSeconds: 30,
  maxAttempts: 8,
  wakeupMaxMessages: 6,
  wakeupMaxDurationMs: 2500,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readConfigValue(row: EdgeFunctionConfigRow | undefined): unknown {
  if (!row || !isRecord(row.config)) {
    return undefined;
  }
  return row.config.value;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return fallback;
}

function toInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

export async function loadGameplayQueueConfig(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
): Promise<GameplayQueueConfig> {
  const { data, error } = await supabaseAdmin
    .from('edge_function_config')
    .select('function_name, config')
    .in('function_name', [...CONFIG_NAMES]);

  if (error) {
    console.error('[gameplayQueue] Failed to load edge_function_config', { error });
    return DEFAULT_GAMEPLAY_QUEUE_CONFIG;
  }

  const rowMap = new Map(
    ((data ?? []) as EdgeFunctionConfigRow[]).map((row) => [row.function_name, row]),
  );

  return {
    queueEnabled: toBoolean(
      readConfigValue(rowMap.get('gameplay_queue_enabled')),
      DEFAULT_GAMEPLAY_QUEUE_CONFIG.queueEnabled,
    ),
    wakeupEnabled: toBoolean(
      readConfigValue(rowMap.get('gameplay_queue_wakeup_enabled')),
      DEFAULT_GAMEPLAY_QUEUE_CONFIG.wakeupEnabled,
    ),
    inlineProcessingEnabled: toBoolean(
      readConfigValue(rowMap.get('gameplay_inline_processing_enabled')),
      DEFAULT_GAMEPLAY_QUEUE_CONFIG.inlineProcessingEnabled,
    ),
    batchSize: Math.max(
      1,
      toInteger(
        readConfigValue(rowMap.get('gameplay_queue_batch_size')),
        DEFAULT_GAMEPLAY_QUEUE_CONFIG.batchSize,
      ),
    ),
    visibilityTimeoutSeconds: Math.max(
      1,
      toInteger(
        readConfigValue(rowMap.get('gameplay_queue_visibility_timeout_seconds')),
        DEFAULT_GAMEPLAY_QUEUE_CONFIG.visibilityTimeoutSeconds,
      ),
    ),
    maxAttempts: Math.max(
      1,
      toInteger(
        readConfigValue(rowMap.get('gameplay_queue_max_attempts')),
        DEFAULT_GAMEPLAY_QUEUE_CONFIG.maxAttempts,
      ),
    ),
    wakeupMaxMessages: Math.max(
      1,
      toInteger(
        readConfigValue(rowMap.get('gameplay_queue_wakeup_max_messages')),
        DEFAULT_GAMEPLAY_QUEUE_CONFIG.wakeupMaxMessages,
      ),
    ),
    wakeupMaxDurationMs: Math.max(
      1,
      toInteger(
        readConfigValue(rowMap.get('gameplay_queue_wakeup_max_duration_ms')),
        DEFAULT_GAMEPLAY_QUEUE_CONFIG.wakeupMaxDurationMs,
      ),
    ),
  };
}

export async function ingestGameplayEvent(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  params: IngestGameplayEventParams,
): Promise<{ eventId: string; duplicate: boolean; enqueued: boolean }> {
  const { data, error } = await supabaseAdmin.rpc('ingest_gameplay_event', {
    p_type: params.type,
    p_user_id: params.userId,
    p_convention_id: params.conventionId ?? null,
    p_payload: params.payload ?? {},
    p_occurred_at: params.occurredAt ?? new Date().toISOString(),
    p_idempotency_key: params.idempotencyKey ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data)
    ? (data[0] as IngestGameplayEventRow | undefined)
    : (data as IngestGameplayEventRow | null);

  if (!row || typeof row.event_id !== 'string') {
    throw new Error('ingest_gameplay_event response missing event_id');
  }

  return {
    eventId: row.event_id,
    duplicate: row.duplicate === true,
    enqueued: row.enqueued === true,
  };
}

export async function drainGameplayQueueOnce(options: DrainGameplayQueueOptions): Promise<void> {
  const response = await fetch(`${options.supabaseUrl}/functions/v1/process-gameplay-queue`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      maxMessages: options.maxMessages,
      maxDurationMs: options.maxDurationMs,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(
      `process-gameplay-queue failed (${response.status} ${response.statusText}): ${errorText}`,
    );
  }
}

export function scheduleGameplayQueueDrain(options: DrainGameplayQueueOptions): void {
  const promise = drainGameplayQueueOnce(options).catch((error) => {
    console.error('[gameplayQueue] Failed to wake queue worker', { error });
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
