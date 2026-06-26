// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions run in Deno.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import type { Json } from './types.ts';

export type BackendWorkerName =
  | 'daily_task_rotation'
  | 'pending_catch_expiration'
  | 'gameplay_queue_drain'
  | 'push_delivery'
  | 'push_receipt_polling';

export type BackendWorkerRunStatus = 'succeeded' | 'failed' | 'partial';

type BackendWorkerRunHandle = {
  id: string | null;
  workerName: BackendWorkerName;
  source: string;
  startedAt: string;
};

type BackendWorkerRunRow = {
  id: string;
  started_at: string;
};

type BeginBackendWorkerRunOptions = {
  workerName: BackendWorkerName;
  source: string;
  metadata?: Json;
};

type CompleteBackendWorkerRunOptions = {
  status: BackendWorkerRunStatus;
  counts?: Json;
  error?: unknown;
  metadata?: Json;
};

const BACKEND_WORKER_DISPLAY_NAMES: Record<BackendWorkerName, string> = {
  daily_task_rotation: 'Daily task rotation',
  pending_catch_expiration: 'Pending catch expiration',
  gameplay_queue_drain: 'Gameplay queue drain',
  push_delivery: 'Push delivery',
  push_receipt_polling: 'Push receipt polling',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function formatErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return truncate(error.message, 1000);
  if (typeof error === 'string') return truncate(error, 1000);
  try {
    return truncate(JSON.stringify(error), 1000);
  } catch {
    return 'Unknown error';
  }
}

function formatErrorDetails(error: unknown): Json | null {
  if (!error) return null;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  if (isRecord(error)) {
    try {
      return JSON.parse(JSON.stringify(error)) as Json;
    } catch {
      return {
        value: String(error),
      };
    }
  }

  return {
    value: String(error),
  };
}

export async function beginBackendWorkerRun(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  options: BeginBackendWorkerRunOptions,
): Promise<BackendWorkerRunHandle> {
  const startedAt = new Date().toISOString();

  try {
    const { data, error } = await supabaseAdmin
      .from('backend_worker_runs')
      .insert({
        worker_name: options.workerName,
        source: options.source,
        status: 'running',
        started_at: startedAt,
        metadata: options.metadata ?? {},
      })
      .select('id, started_at')
      .single();

    if (error) {
      console.error('[backendWorkerRuns] Failed to create run record', {
        worker_name: options.workerName,
        source: options.source,
        error: error.message,
      });
      return { id: null, workerName: options.workerName, source: options.source, startedAt };
    }

    const row = data as BackendWorkerRunRow;
    return {
      id: row.id,
      workerName: options.workerName,
      source: options.source,
      startedAt: row.started_at,
    };
  } catch (error) {
    console.error('[backendWorkerRuns] Unexpected error creating run record', {
      worker_name: options.workerName,
      source: options.source,
      error,
    });
    return { id: null, workerName: options.workerName, source: options.source, startedAt };
  }
}

export async function completeBackendWorkerRun(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  handle: BackendWorkerRunHandle,
  options: CompleteBackendWorkerRunOptions,
): Promise<void> {
  if (!handle.id) {
    return;
  }

  const completedAt = new Date();
  const startedAtMs = new Date(handle.startedAt).getTime();
  const durationMs = Number.isFinite(startedAtMs)
    ? Math.max(0, completedAt.getTime() - startedAtMs)
    : null;

  try {
    const { error } = await supabaseAdmin
      .from('backend_worker_runs')
      .update({
        status: options.status,
        completed_at: completedAt.toISOString(),
        duration_ms: durationMs,
        counts: options.counts ?? {},
        error_message: formatErrorMessage(options.error),
        error_details: formatErrorDetails(options.error),
        metadata: options.metadata ?? {},
      })
      .eq('id', handle.id);

    if (error) {
      console.error('[backendWorkerRuns] Failed to complete run record', {
        worker_name: handle.workerName,
        run_id: handle.id,
        error: error.message,
      });
    }
  } catch (error) {
    console.error('[backendWorkerRuns] Unexpected error completing run record', {
      worker_name: handle.workerName,
      run_id: handle.id,
      error,
    });
  }
}

function numericCount(counts: Json | undefined, key: string): number | null {
  if (!isRecord(counts)) {
    return null;
  }

  const value = counts[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isIdleCronRun(handle: BackendWorkerRunHandle, options: CompleteBackendWorkerRunOptions) {
  if (handle.source !== 'cron' || options.status !== 'succeeded') {
    return false;
  }

  switch (handle.workerName) {
    case 'push_delivery':
      return numericCount(options.counts, 'jobs_claimed') === 0;
    case 'push_receipt_polling':
      return numericCount(options.counts, 'receipts_claimed') === 0;
    case 'gameplay_queue_drain':
      return numericCount(options.counts, 'fetched') === 0;
    case 'daily_task_rotation':
      return numericCount(options.counts, 'conventions_processed') === 0;
    case 'pending_catch_expiration':
      return numericCount(options.counts, 'expired_catches') === 0;
  }

  return false;
}

async function deleteBackendWorkerRun(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  handle: BackendWorkerRunHandle,
) {
  if (!handle.id) {
    return false;
  }

  try {
    const { error } = await supabaseAdmin.from('backend_worker_runs').delete().eq('id', handle.id);

    if (error) {
      console.error('[backendWorkerRuns] Failed to delete idle run record', {
        worker_name: handle.workerName,
        run_id: handle.id,
        error: error.message,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error('[backendWorkerRuns] Unexpected error deleting idle run record', {
      worker_name: handle.workerName,
      run_id: handle.id,
      error,
    });
    return false;
  }
}

async function recordBackendWorkerHeartbeat(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  handle: BackendWorkerRunHandle,
  completedAt: Date,
  durationMs: number | null,
  options: CompleteBackendWorkerRunOptions,
) {
  try {
    const { error } = await supabaseAdmin.rpc('record_backend_worker_heartbeat', {
      p_worker_name: handle.workerName,
      p_display_name: BACKEND_WORKER_DISPLAY_NAMES[handle.workerName],
      p_source: handle.source,
      p_last_idle_at: completedAt.toISOString(),
      p_last_idle_duration_ms: durationMs,
      p_last_idle_counts: options.counts ?? {},
      p_metadata: options.metadata ?? {},
    });

    if (error) {
      console.error('[backendWorkerRuns] Failed to record idle heartbeat', {
        worker_name: handle.workerName,
        run_id: handle.id,
        error: error.message,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error('[backendWorkerRuns] Unexpected error recording idle heartbeat', {
      worker_name: handle.workerName,
      run_id: handle.id,
      error,
    });
    return false;
  }
}

export async function completeOrHeartbeatBackendWorkerRun(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  handle: BackendWorkerRunHandle,
  options: CompleteBackendWorkerRunOptions,
): Promise<void> {
  if (!isIdleCronRun(handle, options)) {
    await completeBackendWorkerRun(supabaseAdmin, handle, options);
    return;
  }

  const completedAt = new Date();
  const startedAtMs = new Date(handle.startedAt).getTime();
  const durationMs = Number.isFinite(startedAtMs)
    ? Math.max(0, completedAt.getTime() - startedAtMs)
    : null;

  if (!handle.id) {
    await completeBackendWorkerRun(supabaseAdmin, handle, options);
    return;
  }

  const recorded = await recordBackendWorkerHeartbeat(
    supabaseAdmin,
    handle,
    completedAt,
    durationMs,
    options,
  );

  if (!recorded) {
    await completeBackendWorkerRun(supabaseAdmin, handle, options);
    return;
  }

  const deleted = await deleteBackendWorkerRun(supabaseAdmin, handle);
  if (!deleted) {
    await completeBackendWorkerRun(supabaseAdmin, handle, options);
  }
}
