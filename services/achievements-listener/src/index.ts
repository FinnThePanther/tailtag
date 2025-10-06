import { config as loadEnv } from "dotenv";
import http from "node:http";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pRetry from "p-retry";
import * as achievementsProcessorModule from "#achievements-processor";
import type {
  AchievementEvent,
  ProcessResult,
  AwardResult,
  Achievement,
  Json,
} from "#achievements-processor";

const processorExports = (achievementsProcessorModule as unknown as {
  default?: Record<string, unknown>;
})?.default ?? achievementsProcessorModule;

const { createAchievementProcessor } =
  processorExports as typeof import("#achievements-processor");

type AwardHookPayload = {
  userId: string;
  achievement: Achievement;
  context: Json;
  event: AchievementEvent | null;
};

async function insertNotification({
  userId,
  achievement,
  context,
  event,
}: AwardHookPayload) {
  if (!userId) return;

  const notification = {
    user_id: userId,
    achievement_key: achievement.key,
    context,
    event_id: event?.id ?? null,
    event_type: event?.event_type ?? null,
  } as const;

  const { error } = await client.from("achievement_notifications").insert(notification);

  if (error) {
    if (error.code === "23505") {
      logger.debug(
        `Notification already exists for ${achievement.key} (${event?.id ?? "no-event"})`,
      );
      return;
    }
    logger.error("Failed inserting achievement notification", error);
  }
}

loadEnv();

const LOG_PREFIX = "[achievements-listener]";

const logger = {
  info: (...args: unknown[]) => console.info(LOG_PREFIX, ...args),
  warn: (...args: unknown[]) => console.warn(LOG_PREFIX, ...args),
  error: (...args: unknown[]) => console.error(LOG_PREFIX, ...args),
  debug: (...args: unknown[]) => console.debug(LOG_PREFIX, ...args),
};

function startHealthServer() {
  const port = Number.parseInt(process.env.PORT ?? "8080", 10);

  const server = http.createServer((req, res) => {
    if (!req.url || !req.method) {
      res.writeHead(400);
      res.end();
      return;
    }

    if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
      const body = JSON.stringify({ status: "ok" });
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body).toString(),
      });
      res.end(body);
      return;
    }

    if (req.method === "HEAD" && (req.url === "/" || req.url === "/health")) {
      res.writeHead(200);
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    logger.info(`Health server listening on port ${port}`);
  });

  server.on("error", (error) => {
    logger.error("Health server error", error);
  });

  return server;
}

const healthServer = startHealthServer();

const rawEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SERVICE_ROLE_KEY: process.env.SERVICE_ROLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
} as const;

function requireEnv<Key extends keyof typeof rawEnv>(name: Key): string {
  const value = rawEnv[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const serviceRoleKey =
  rawEnv.SERVICE_ROLE_KEY
  ?? rawEnv.SUPABASE_SERVICE_ROLE_KEY
  ?? requireEnv("SERVICE_ROLE_KEY");

const client: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    params: {
      eventsPerSecond: "1",
    },
  },
});

const processor = createAchievementProcessor({
  supabase: client,
  logger,
  onAwardGranted: insertNotification,
});

type DailyTaskKind = "catch" | "view_bio" | "leaderboard" | "meta" | "share";

type DailyTaskMetadata = Record<string, unknown>;

type DailyTaskDefinition = {
  id: string;
  kind: DailyTaskKind;
  name: string;
  description: string;
  requirement: number;
  metadata: DailyTaskMetadata;
};

type RawDailyTaskRow = {
  id: string;
  kind: string;
  name: string;
  description: string;
  requirement: number;
  metadata?: unknown;
  is_active?: boolean | null;
};

type DailyAssignment = {
  day: string;
  position: number;
  task: DailyTaskDefinition;
};

type DailyAssignmentCacheEntry = {
  assignments: DailyAssignment[];
  fetchedAt: number;
  ttlMs: number;
};

type DailyProgressRow = {
  task_id: string;
  current_count: number;
  is_completed: boolean;
  completed_at: string | null;
};

const DAILY_ASSIGNMENT_CACHE_TTL_SUCCESS_MS = 5 * 60 * 1000; // 5 minutes
const DAILY_ASSIGNMENT_CACHE_TTL_EMPTY_MS = 60 * 1000; // 1 minute
const DAILY_LOG_PREFIX = "[daily]";

const dailyAssignmentCache = new Map<string, DailyAssignmentCacheEntry>();

function toUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isoToUtcDay(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return toUtcDay(new Date());
  }
  return toUtcDay(parsed);
}

function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function previousDay(day: string): string {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() - 1);
  return toUtcDay(date);
}

function dayRange(day: string): { start: string; end: string } {
  const startDate = parseDay(day);
  const endDate = parseDay(day);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

function coerceIso(iso: string | null | undefined, fallback: string): string {
  if (!iso) return fallback;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

function determineEventTimestamp(event: AchievementEvent): string {
  const createdFallback = coerceIso(event.created_at, new Date().toISOString());
  if (event.event_type === "catch.created") {
    const payload = event.payload as { caught_at?: string | null } | null;
    if (payload?.caught_at) {
      return coerceIso(payload.caught_at, createdFallback);
    }
  } else if (event.event_type === "leaderboard.refreshed") {
    const payload = event.payload as { refreshed_at?: string | null } | null;
    if (payload?.refreshed_at) {
      return coerceIso(payload.refreshed_at, createdFallback);
    }
  }
  return createdFallback;
}

async function loadDailyAssignments(day: string): Promise<DailyAssignment[]> {
  const cacheHit = dailyAssignmentCache.get(day);
  const now = Date.now();
  if (cacheHit && now - cacheHit.fetchedAt < cacheHit.ttlMs) {
    return cacheHit.assignments;
  }

  const { data, error } = await client
    .from("daily_assignments")
    .select(
      "day, position, task:daily_tasks(id, kind, name, description, requirement, metadata, is_active)"
    )
    .eq("day", day)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(`Unable to load daily assignments for ${day}: ${error.message}`);
  }

  const assignments: DailyAssignment[] = [];
  for (const row of data ?? []) {
    const taskRelation = row.task as unknown;
    const resolvedTask = Array.isArray(taskRelation) ? taskRelation[0] : taskRelation;

    if (!resolvedTask || typeof resolvedTask !== "object") {
      continue;
    }

    const task = resolvedTask as RawDailyTaskRow;
    if (task.is_active === false) continue;

    const taskKind = task.kind as DailyTaskKind;
    if (
      taskKind !== "catch"
      && taskKind !== "view_bio"
      && taskKind !== "leaderboard"
      && taskKind !== "meta"
      && taskKind !== "share"
    ) {
      logger.warn(`${DAILY_LOG_PREFIX} Unknown task kind '${task.kind}'`);
      continue;
    }

    assignments.push({
      day: row.day as string,
      position: row.position as number,
      task: {
        id: task.id,
        kind: taskKind,
        name: task.name,
        description: task.description,
        requirement: task.requirement,
        metadata: (task.metadata ?? {}) as DailyTaskMetadata,
      },
    });
  }

  const ttlMs = assignments.length > 0
    ? DAILY_ASSIGNMENT_CACHE_TTL_SUCCESS_MS
    : DAILY_ASSIGNMENT_CACHE_TTL_EMPTY_MS;

  dailyAssignmentCache.set(day, {
    assignments,
    fetchedAt: now,
    ttlMs,
  });

  return assignments;
}

async function getDailyAssignments(day: string): Promise<DailyAssignment[]> {
  try {
    return await loadDailyAssignments(day);
  } catch (error) {
    logger.error(`Failed fetching daily assignments for ${day}`, error);
    return [];
  }
}

async function fetchProgressMap(
  userId: string,
  day: string,
  taskIds: string[],
): Promise<Map<string, DailyProgressRow>> {
  if (taskIds.length === 0) return new Map();

  const { data, error } = await client
    .from("user_daily_progress")
    .select("task_id, current_count, is_completed, completed_at")
    .eq("user_id", userId)
    .eq("day", day)
    .in("task_id", taskIds);

  if (error) {
    throw new Error(`Unable to load daily progress for ${userId} on ${day}: ${error.message}`);
  }

  const map = new Map<string, DailyProgressRow>();
  for (const row of data ?? []) {
    const entry = row as DailyProgressRow;
    map.set(entry.task_id, {
      task_id: entry.task_id,
      current_count: entry.current_count ?? 0,
      is_completed: entry.is_completed ?? false,
      completed_at: entry.completed_at ?? null,
    });
  }
  return map;
}

async function upsertProgress(
  userId: string,
  day: string,
  assignment: DailyAssignment,
  progressMap: Map<string, DailyProgressRow>,
  absoluteCount: number,
  eventTimestampIso: string,
): Promise<boolean> {
  const existing = progressMap.get(assignment.task.id);
  const currentCount = existing?.current_count ?? 0;
  const targetCount = Math.max(currentCount, absoluteCount);
  const clampedCount = Math.min(targetCount, assignment.task.requirement);
  const completed = clampedCount >= assignment.task.requirement;
  const shouldUpdate =
    !existing
    || existing.current_count !== clampedCount
    || existing.is_completed !== completed
    || (completed && !existing.completed_at);

  if (!shouldUpdate) {
    return false;
  }

  const completedAt = completed
    ? existing?.completed_at ?? eventTimestampIso
    : null;

  const { error } = await client
    .from("user_daily_progress")
    .upsert({
      user_id: userId,
      day,
      task_id: assignment.task.id,
      current_count: clampedCount,
      is_completed: completed,
      completed_at: completedAt,
    });

  if (error) {
    throw new Error(
      `Unable to upsert daily progress for user ${userId}, task ${assignment.task.id}: ${error.message}`,
    );
  }

  progressMap.set(assignment.task.id, {
    task_id: assignment.task.id,
    current_count: clampedCount,
    is_completed: completed,
    completed_at: completedAt,
  });

  return true;
}

async function ensureAllTasksCompleted(
  userId: string,
  day: string,
  assignments: DailyAssignment[],
  eventTimestampIso: string,
): Promise<void> {
  if (assignments.length === 0) return;

  const { data, error } = await client
    .from("user_daily_progress")
    .select("task_id, is_completed, completed_at")
    .eq("user_id", userId)
    .eq("day", day);

  if (error) {
    throw new Error(`Unable to verify daily completion for ${userId} on ${day}: ${error.message}`);
  }

  const completionMap = new Map<string, { is_completed: boolean; completed_at: string | null }>();
  for (const row of data ?? []) {
    completionMap.set(row.task_id as string, {
      is_completed: Boolean(row.is_completed),
      completed_at: (row.completed_at as string | null) ?? null,
    });
  }

  const allComplete = assignments.every((assignment) =>
    completionMap.get(assignment.task.id)?.is_completed === true
  );

  if (!allComplete) {
    return;
  }

  const { data: streakRow, error: streakError } = await client
    .from("user_daily_streaks")
    .select("current_streak, best_streak, last_completed_day")
    .eq("user_id", userId)
    .maybeSingle();

  if (streakError) {
    throw new Error(`Unable to load streak for ${userId}: ${streakError.message}`);
  }

  if (streakRow?.last_completed_day === day) {
    return;
  }

  const prevDay = previousDay(day);
  const currentStreakPrior = streakRow?.current_streak ?? 0;
  const bestStreakPrior = streakRow?.best_streak ?? 0;
  const lastCompletedDay = streakRow?.last_completed_day ?? null;

  const newCurrentStreak = lastCompletedDay === prevDay ? currentStreakPrior + 1 : 1;
  const newBestStreak = Math.max(bestStreakPrior, newCurrentStreak);

  const { error: upsertError } = await client
    .from("user_daily_streaks")
    .upsert({
      user_id: userId,
      current_streak: newCurrentStreak,
      best_streak: newBestStreak,
      last_completed_day: day,
    });

  if (upsertError) {
    throw new Error(`Unable to update streak for ${userId}: ${upsertError.message}`);
  }

  logger.info(
    `${DAILY_LOG_PREFIX} User ${userId} completed all tasks for ${day} (streak ${newCurrentStreak})`,
  );
}

async function fetchCatchesForDay(
  userId: string,
  day: string,
): Promise<{ total: number; distinct: number }> {
  const { start, end } = dayRange(day);
  const { data, error } = await client
    .from("catches")
    .select("fursuit_id")
    .eq("catcher_id", userId)
    .gte("caught_at", start)
    .lt("caught_at", end);

  if (error) {
    throw new Error(
      `Unable to load catches for user ${userId} on ${day}: ${error.message}`,
    );
  }

  const rows = data ?? [];
  const unique = new Set<string>();
  for (const row of rows) {
    const fursuitId = (row as { fursuit_id?: string | null }).fursuit_id;
    if (fursuitId) {
      unique.add(fursuitId);
    }
  }

  return {
    total: rows.length,
    distinct: unique.size,
  };
}

async function processCatchDailyTasks(
  event: AchievementEvent,
  day: string,
  assignments: DailyAssignment[],
  eventTimestampIso: string,
): Promise<void> {
  const payload = event.payload as {
    catcher_id?: string | null;
  } | null;

  const userId = payload?.catcher_id ?? null;
  if (!userId) {
    logger.warn(`${DAILY_LOG_PREFIX} Catch event ${event.id} missing catcher_id`);
    return;
  }

  const relevantAssignments = assignments.filter((assignment) => assignment.task.kind === "catch");
  if (relevantAssignments.length === 0) {
    return;
  }

  const stats = await fetchCatchesForDay(userId, day);
  const taskIds = relevantAssignments.map((assignment) => assignment.task.id);
  const progressMap = await fetchProgressMap(userId, day, taskIds);

  let changed = false;

  for (const assignment of relevantAssignments) {
    const metadata = assignment.task.metadata ?? {};
    const requiresDistinct = metadata.distinct === true;
    const absoluteCount = requiresDistinct ? stats.distinct : stats.total;
    if (absoluteCount === 0) {
      continue;
    }

    const updated = await upsertProgress(
      userId,
      day,
      assignment,
      progressMap,
      absoluteCount,
      eventTimestampIso,
    );

    if (updated) {
      changed = true;
    }
  }

  if (changed) {
    await ensureAllTasksCompleted(userId, day, assignments, eventTimestampIso);
  }
}

async function processLeaderboardDailyTasks(
  event: AchievementEvent,
  day: string,
  assignments: DailyAssignment[],
  eventTimestampIso: string,
): Promise<void> {
  const payload = event.payload as {
    user_id?: string | null;
  } | null;

  const userId = payload?.user_id ?? null;
  if (!userId) {
    logger.warn(`${DAILY_LOG_PREFIX} Leaderboard refresh event ${event.id} missing user_id`);
    return;
  }

  const relevantAssignments = assignments.filter((assignment) => assignment.task.kind === "leaderboard");
  if (relevantAssignments.length === 0) {
    return;
  }

  const taskIds = relevantAssignments.map((assignment) => assignment.task.id);
  const progressMap = await fetchProgressMap(userId, day, taskIds);

  let changed = false;

  for (const assignment of relevantAssignments) {
    const existing = progressMap.get(assignment.task.id);
    const nextCount = Math.min((existing?.current_count ?? 0) + 1, assignment.task.requirement);

    const updated = await upsertProgress(
      userId,
      day,
      assignment,
      progressMap,
      nextCount,
      eventTimestampIso,
    );

    if (updated) {
      changed = true;
    }
  }

  if (changed) {
    await ensureAllTasksCompleted(userId, day, assignments, eventTimestampIso);
  }
}

async function processDailyTasks(event: AchievementEvent): Promise<void> {
  const eventTimestampIso = determineEventTimestamp(event);
  const day = isoToUtcDay(eventTimestampIso);
  const assignments = await getDailyAssignments(day);

  if (assignments.length === 0) {
    logger.debug(`${DAILY_LOG_PREFIX} No assignments for ${day}, skipping event ${event.id}`);
    return;
  }

  const eventType = event.event_type as string;

  switch (eventType) {
    case "catch.created":
      await processCatchDailyTasks(event, day, assignments, eventTimestampIso);
      break;
    case "leaderboard.refreshed":
      await processLeaderboardDailyTasks(event, day, assignments, eventTimestampIso);
      break;
    default:
      logger.debug(`${DAILY_LOG_PREFIX} No handler for event type ${eventType}`);
  }
}

let queue = Promise.resolve();

function enqueue(event: AchievementEvent) {
  queue = queue
    .then(() => handleEvent(event))
    .catch((error) => {
      logger.error("Unhandled error while processing queued event", error);
    });
}

async function handleEvent(event: AchievementEvent) {
  if (event.processed_at) {
    logger.debug(`Skipping event ${event.id} - already processed`);
    return;
  }

  let processResult: ProcessResult | undefined;

  await pRetry(
    async () => {
      processResult = await processor.processEvent(event);
    },
    {
      retries: 3,
      onFailedAttempt: (error) => {
        logger.warn(
          `Attempt ${error.attemptNumber} failed for event ${event.id}: ${(error as Error).message}`,
        );
      },
    },
  ).catch((error) => {
    logger.error(`Failed processing event ${event.id} after retries`, error);
  });

  if (processResult) {
    logResult(processResult);
  }

  await pRetry(
    async () => {
      await processDailyTasks(event);
    },
    {
      retries: 3,
      onFailedAttempt: (error) => {
        logger.warn(
          `Daily tasks attempt ${error.attemptNumber} failed for event ${event.id}: ${(error as Error).message}`,
        );
      },
    },
  ).catch((error) => {
    logger.error(`Failed updating daily tasks for event ${event.id} after retries`, error);
  });
}

function logResult(result: ProcessResult) {
  if (result.skipped) {
    logger.info(`Event ${result.eventId} skipped (${result.eventType})`);
    return;
  }

  const awarded: AwardResult[] = result.awards.filter((award: AwardResult) => award.awarded);
  if (awarded.length === 0) {
    logger.info(`Event ${result.eventId} (${result.eventType}) processed – no awards`);
    return;
  }

  const summary = awarded
    .map((award) => `${award.key}→${award.userId}`)
    .join(", ");
  logger.info(`Event ${result.eventId} (${result.eventType}) awarded: ${summary}`);
}

async function runInitialSweep() {
  try {
    const { processed } = await processor.processPendingEvents({
      limitPerBatch: Number.parseInt(process.env.INITIAL_SWEEP_LIMIT ?? "50", 10),
      maxBatches: Number.parseInt(process.env.INITIAL_SWEEP_MAX_BATCHES ?? "10", 10),
    });
    if (processed > 0) {
      logger.info(`Initial sweep processed ${processed} pending events`);
    } else {
      logger.info("Initial sweep found no pending events");
    }
  } catch (error) {
    logger.error("Initial sweep failed", error);
  }
}

async function main() {
  await runInitialSweep();

  const channel = client.channel("achievements-events-listener", {
    config: {
      broadcast: { ack: true },
      presence: { key: `listener:${process.env.RENDER_SERVICE_ID ?? "local"}` },
    },
  });

  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "achievement_events",
    },
    (payload) => {
      const event = payload.new as AchievementEvent;
      logger.debug(`Received event ${event.id} via realtime`);
      enqueue(event);
    },
  );

  const subscribeTimeoutMs = Number.parseInt(
    process.env.REALTIME_SUBSCRIBE_TIMEOUT_MS ?? "15000",
    10,
  );

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Realtime subscribe timed out after ${subscribeTimeoutMs}ms`));
    }, subscribeTimeoutMs);

    channel.subscribe((realtimeStatus, err) => {
      logger.info(`Realtime status changed: ${realtimeStatus}`);

      if (realtimeStatus === "SUBSCRIBED") {
        clearTimeout(timeoutId);
        resolve();
      } else if (realtimeStatus === "CHANNEL_ERROR") {
        clearTimeout(timeoutId);
        reject(err ?? new Error("Realtime channel error"));
      } else if (realtimeStatus === "CLOSED") {
        clearTimeout(timeoutId);
        reject(new Error("Realtime channel closed during subscribe"));
      } else if (realtimeStatus === "TIMED_OUT") {
        clearTimeout(timeoutId);
        reject(new Error("Realtime channel subscribe timed out"));
      }
    });
  });

  logger.info("Realtime subscription established – awaiting events");

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info(`Received ${signal}, shutting down listener`);
    await channel.unsubscribe();
    await client.removeChannel(channel);
    await new Promise<void>((resolve) => {
      healthServer.close(() => resolve());
    });
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  logger.error("Fatal error in achievements listener", error);
  process.exit(1);
});
