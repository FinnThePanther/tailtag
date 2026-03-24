/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions use remote esm.sh imports.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { processAchievementsForEvent } from "../_shared/achievements.ts";
import { loadGameplayQueueConfig } from "../_shared/gameplayQueue.ts";
import type { InsertableEventRow } from "../_shared/types.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey =
  Deno.env.get("SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing Supabase configuration (SUPABASE_URL / SERVICE_ROLE_KEY)",
  );
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

type QueueMessage = {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: Record<string, unknown> | null;
};

type GameplayEventRow = InsertableEventRow & {
  processed_at: string | null;
};

type WorkerRequestBody = {
  maxMessages?: unknown;
  maxDurationMs?: unknown;
};

type WorkerResult = {
  fetched: number;
  processed: number;
  failed: number;
  deleted: number;
  archived: number;
  disabled?: boolean;
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function extractBearerAuthorization(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!header) {
    return null;
  }
  const parts = header.trim().split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }
  return parts[1];
}

function isServiceRoleAuth(req: Request): boolean {
  return extractBearerAuthorization(req) === serviceRoleKey;
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function toRetryCount(readCount: number): number {
  return Math.max(readCount - 1, 0);
}

async function readQueueBatch(
  visibilityTimeoutSeconds: number,
  batchSize: number,
): Promise<QueueMessage[]> {
  const { data, error } = await supabaseAdmin.rpc("read_gameplay_event_queue", {
    p_visibility_timeout_seconds: visibilityTimeoutSeconds,
    p_batch_size: batchSize,
  });

  if (error) {
    throw new Error(`Failed to read gameplay queue: ${error.message}`);
  }

  return (data ?? []) as QueueMessage[];
}

async function deleteQueueMessage(messageId: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc("delete_gameplay_event_queue_message", {
    p_message_id: messageId,
  });

  if (error) {
    throw new Error(`Failed to delete gameplay queue message ${messageId}: ${error.message}`);
  }
}

async function archiveQueueMessage(messageId: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc("archive_gameplay_event_queue_message", {
    p_message_id: messageId,
  });

  if (error) {
    throw new Error(`Failed to archive gameplay queue message ${messageId}: ${error.message}`);
  }
}

async function loadEventRow(eventId: string): Promise<GameplayEventRow | null> {
  const { data, error } = await supabaseAdmin
    .from("events")
    .select("event_id, user_id, convention_id, type, payload, occurred_at, processed_at")
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load event ${eventId}: ${error.message}`);
  }

  return (data ?? null) as GameplayEventRow | null;
}

async function updateEventAttempt(
  eventId: string,
  readCount: number,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("events")
    .update({
      retry_count: toRetryCount(readCount),
      last_attempted_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);

  if (error) {
    throw new Error(`Failed to update event attempt for ${eventId}: ${error.message}`);
  }
}

async function markEventSuccess(
  eventId: string,
  readCount: number,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("events")
    .update({
      retry_count: toRetryCount(readCount),
      processed_at: new Date().toISOString(),
      last_attempted_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("event_id", eventId);

  if (error) {
    throw new Error(`Failed to mark event success for ${eventId}: ${error.message}`);
  }
}

async function markEventFailure(
  eventId: string,
  readCount: number,
  errorMessage: string,
  deadLetterReason?: string,
): Promise<void> {
  const updatePayload: Record<string, unknown> = {
    retry_count: toRetryCount(readCount),
    last_attempted_at: new Date().toISOString(),
    last_error: errorMessage,
  };

  if (deadLetterReason) {
    updatePayload.dead_lettered_at = new Date().toISOString();
    updatePayload.dead_letter_reason = deadLetterReason;
  }

  const { error } = await supabaseAdmin
    .from("events")
    .update(updatePayload)
    .eq("event_id", eventId);

  if (error) {
    throw new Error(`Failed to mark event failure for ${eventId}: ${error.message}`);
  }
}

async function processQueueMessage(
  queueMessage: QueueMessage,
  maxAttempts: number,
): Promise<Pick<WorkerResult, "processed" | "failed" | "deleted" | "archived">> {
  const payload = queueMessage.message ?? {};
  const eventId = typeof payload.event_id === "string" ? payload.event_id : null;

  if (!eventId) {
    await archiveQueueMessage(queueMessage.msg_id);
    console.error("[process-gameplay-queue] Archived malformed message", {
      message_id: queueMessage.msg_id,
      payload,
    });
    return { processed: 0, failed: 1, deleted: 0, archived: 1 };
  }

  const eventRow = await loadEventRow(eventId);

  if (!eventRow) {
    await archiveQueueMessage(queueMessage.msg_id);
    console.error("[process-gameplay-queue] Archived queue message for missing event", {
      message_id: queueMessage.msg_id,
      event_id: eventId,
    });
    return { processed: 0, failed: 1, deleted: 0, archived: 1 };
  }

  if (eventRow.processed_at) {
    await deleteQueueMessage(queueMessage.msg_id);
    return { processed: 0, failed: 0, deleted: 1, archived: 0 };
  }

  await updateEventAttempt(eventId, queueMessage.read_ct);

  try {
    await processAchievementsForEvent(supabaseAdmin, eventRow);
    await markEventSuccess(eventId, queueMessage.read_ct);
    await deleteQueueMessage(queueMessage.msg_id);
    return { processed: 1, failed: 0, deleted: 1, archived: 0 };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const shouldArchive = queueMessage.read_ct >= maxAttempts;

    if (shouldArchive) {
      await archiveQueueMessage(queueMessage.msg_id);
      await markEventFailure(
        eventId,
        queueMessage.read_ct,
        errorMessage,
        `Max attempts exceeded (${queueMessage.read_ct}/${maxAttempts})`,
      );
      console.error("[process-gameplay-queue] Archived failed event", {
        event_id: eventId,
        message_id: queueMessage.msg_id,
        read_ct: queueMessage.read_ct,
        error: errorMessage,
      });
      return { processed: 0, failed: 1, deleted: 0, archived: 1 };
    }

    await markEventFailure(eventId, queueMessage.read_ct, errorMessage);
    console.error("[process-gameplay-queue] Failed processing event", {
      event_id: eventId,
      message_id: queueMessage.msg_id,
      read_ct: queueMessage.read_ct,
      error: errorMessage,
    });
    return { processed: 0, failed: 1, deleted: 0, archived: 0 };
  }
}

async function processQueue(req: Request): Promise<WorkerResult> {
  const config = await loadGameplayQueueConfig(supabaseAdmin);

  if (!config.queueEnabled) {
    return {
      fetched: 0,
      processed: 0,
      failed: 0,
      deleted: 0,
      archived: 0,
      disabled: true,
    };
  }

  let body: WorkerRequestBody = {};
  try {
    body = (await req.json()) as WorkerRequestBody;
  } catch {
    body = {};
  }

  const maxMessages = parsePositiveInteger(body.maxMessages) ?? config.batchSize;
  const maxDurationMs = parsePositiveInteger(body.maxDurationMs);
  const startedAt = Date.now();

  const result: WorkerResult = {
    fetched: 0,
    processed: 0,
    failed: 0,
    deleted: 0,
    archived: 0,
  };

  while (result.fetched < maxMessages) {
    if (maxDurationMs !== null && Date.now() - startedAt >= maxDurationMs) {
      break;
    }

    const remaining = maxMessages - result.fetched;
    const batchSize = Math.min(config.batchSize, remaining);
    const rows = await readQueueBatch(config.visibilityTimeoutSeconds, batchSize);

    if (rows.length === 0) {
      break;
    }

    result.fetched += rows.length;

    for (const row of rows) {
      if (maxDurationMs !== null && Date.now() - startedAt >= maxDurationMs) {
        return result;
      }

      const messageResult = await processQueueMessage(row, config.maxAttempts);
      result.processed += messageResult.processed;
      result.failed += messageResult.failed;
      result.deleted += messageResult.deleted;
      result.archived += messageResult.archived;
    }
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  if (!isServiceRoleAuth(req)) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  try {
    const result = await processQueue(req);
    return jsonResponse(200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[process-gameplay-queue] Queue processing failed", { error });
    return jsonResponse(500, { error: message });
  }
});
