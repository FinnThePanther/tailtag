import type { AchievementEvent, CatchEventPayload } from "../achievements/processor.ts";

type Json = Record<string, unknown>;

type SupabaseClientLike = {
  from: (table: string) => any;
};

type LoggerLike = Pick<typeof console, "info" | "warn" | "error" | "debug">;

type DailyTaskKind = "catch" | "view_bio" | "leaderboard" | "meta" | "share";

type DailyTaskDefinition = {
  id: string;
  kind: DailyTaskKind;
  name: string;
  description: string;
  requirement: number;
  metadata: Json;
  isActive: boolean;
};

type DailyAssignment = {
  day: string;
  position: number;
  conventionId: string;
  task: DailyTaskDefinition;
};

type ProgressRow = {
  task_id: string;
  current_count: number;
  is_completed: boolean;
  completed_at: string | null;
};

type ConventionInfo = {
  id: string;
  timezone: string;
};

type ProcessContext = {
  event: AchievementEvent;
  supabase: SupabaseClientLike;
  logger?: LoggerLike;
};

const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateFormatter(timezone: string) {
  if (!dateFormatterCache.has(timezone)) {
    dateFormatterCache.set(
      timezone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    );
  }
  return dateFormatterCache.get(timezone)!;
}

function getDateTimeFormatter(timezone: string) {
  if (!dateTimeFormatterCache.has(timezone)) {
    dateTimeFormatterCache.set(
      timezone,
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZoneName: "shortOffset",
      }),
    );
  }
  return dateTimeFormatterCache.get(timezone)!;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function getOffsetMilliseconds(timestamp: number, timezone: string): number {
  const formatter = getDateTimeFormatter(timezone);
  const parts = formatter.formatToParts(new Date(timestamp));
  const zone = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = zone.match(/GMT([+-])(\d{2})(?::(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  return sign * ((hours * 60 + minutes) * 60 * 1000);
}

function zonedTimeToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const utcTimestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = getOffsetMilliseconds(utcTimestamp, timezone);
  let adjusted = utcTimestamp - offset;
  const newOffset = getOffsetMilliseconds(adjusted, timezone);
  if (newOffset !== offset) {
    offset = newOffset;
    adjusted = utcTimestamp - offset;
  }
  return new Date(adjusted);
}

function getDayRangeUtc(day: string, timezone: string): { startUtc: string; endUtc: string } {
  const [year, month, dayNumber] = day.split("-").map((value) => Number(value));
  const start = zonedTimeToUtc(timezone, year, month, dayNumber);
  const end = zonedTimeToUtc(timezone, year, month, dayNumber + 1);
  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  };
}

function getLocalDayFromTimestamp(timestampIso: string, timezone: string): string {
  const date = new Date(timestampIso);
  if (Number.isNaN(date.getTime())) {
    return getDateFormatter(timezone).format(new Date()).replace(/\//g, "-");
  }
  const parts = getDateFormatter(timezone).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const dayNumber = Number(lookup.day);
  return `${year}-${pad(month)}-${pad(dayNumber)}`;
}

function previousDayLocal(day: string, timezone: string): string {
  const [year, month, dayNumber] = day.split("-").map((value) => Number(value));
  const startOfDayUtc = zonedTimeToUtc(timezone, year, month, dayNumber);
  const previous = new Date(startOfDayUtc.getTime() - MILLISECONDS_IN_DAY);
  const parts = getDateFormatter(timezone).formatToParts(previous);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const prevYear = Number(lookup.year);
  const prevMonth = Number(lookup.month);
  const prevDay = Number(lookup.day);
  return `${prevYear}-${pad(prevMonth)}-${pad(prevDay)}`;
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
  }
  if (event.event_type === "leaderboard.refreshed") {
    const payload = event.payload as { refreshed_at?: string | null } | null;
    if (payload?.refreshed_at) {
      return coerceIso(payload.refreshed_at, createdFallback);
    }
  }
  return createdFallback;
}

async function getConventionInfo(
  supabase: SupabaseClientLike,
  conventionId: string,
): Promise<ConventionInfo> {
  const { data, error } = await supabase
    .from("conventions")
    .select("id, timezone")
    .eq("id", conventionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load convention ${conventionId}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Convention ${conventionId} not found`);
  }

  const timezone = (data.timezone as string | null) ?? "UTC";
  return { id: data.id as string, timezone };
}

function normalizeTaskKind(kind: unknown): DailyTaskKind | null {
  if (typeof kind !== "string") return null;
  if (kind === "catch" || kind === "view_bio" || kind === "leaderboard" || kind === "meta" || kind === "share") {
    return kind;
  }
  return null;
}

async function loadDailyAssignments(
  supabase: SupabaseClientLike,
  conventionId: string,
  day: string,
): Promise<DailyAssignment[]> {
  const { data, error } = await supabase
    .from("daily_assignments")
    .select(
      "day, convention_id, position, task:daily_tasks(id, kind, name, description, requirement, metadata, is_active)"
    )
    .eq("convention_id", conventionId)
    .eq("day", day)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(
      `Unable to load daily assignments for ${day} (convention ${conventionId}): ${error.message}`,
    );
  }

  const assignments: DailyAssignment[] = [];
  for (const row of data ?? []) {
    const taskRelation = row.task as unknown;
    const resolvedTask = Array.isArray(taskRelation) ? taskRelation[0] : taskRelation;
    if (!resolvedTask || typeof resolvedTask !== "object") {
      continue;
    }

    const taskKind = normalizeTaskKind((resolvedTask as { kind?: unknown }).kind);
    if (!taskKind) {
      continue;
    }

    const isActive = (resolvedTask as { is_active?: boolean | null }).is_active !== false;
    if (!isActive) {
      continue;
    }

    assignments.push({
      day: row.day as string,
      position: row.position as number,
      conventionId: row.convention_id as string,
      task: {
        id: (resolvedTask as { id: string }).id,
        kind: taskKind,
        name: (resolvedTask as { name: string }).name,
        description: (resolvedTask as { description: string }).description,
        requirement: Number((resolvedTask as { requirement: number }).requirement ?? 0) || 0,
        metadata: ((resolvedTask as { metadata?: Json | null }).metadata ?? {}) as Json,
        isActive,
      },
    });
  }

  return assignments;
}

async function fetchProgressMap(
  supabase: SupabaseClientLike,
  userId: string,
  conventionId: string,
  day: string,
  taskIds: string[],
): Promise<Map<string, ProgressRow>> {
  if (taskIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("user_daily_progress")
    .select("task_id, current_count, is_completed, completed_at")
    .eq("user_id", userId)
    .eq("convention_id", conventionId)
    .eq("day", day)
    .in("task_id", taskIds);

  if (error) {
    throw new Error(`Unable to load daily progress: ${error.message}`);
  }

  const map = new Map<string, ProgressRow>();
  for (const row of data ?? []) {
    map.set(row.task_id as string, {
      task_id: row.task_id as string,
      current_count: Number(row.current_count ?? 0),
      is_completed: Boolean(row.is_completed),
      completed_at: (row.completed_at as string | null) ?? null,
    });
  }
  return map;
}

async function upsertProgress(
  supabase: SupabaseClientLike,
  userId: string,
  conventionId: string,
  day: string,
  assignment: DailyAssignment,
  progressMap: Map<string, ProgressRow>,
  nextCount: number,
  eventTimestampIso: string,
): Promise<boolean> {
  const requirement = Math.max(assignment.task.requirement ?? 0, 0);
  const clampedCount = requirement > 0 ? Math.min(nextCount, requirement) : nextCount;
  const completed = requirement > 0 ? clampedCount >= requirement : false;
  const prior = progressMap.get(assignment.task.id);

  if (prior && prior.current_count === clampedCount && prior.is_completed === completed) {
    return false;
  }

  const completedAt = completed ? eventTimestampIso : null;

  const { error } = await supabase
    .from("user_daily_progress")
    .upsert({
      user_id: userId,
      convention_id: conventionId,
      day,
      task_id: assignment.task.id,
      current_count: clampedCount,
      is_completed: completed,
      completed_at: completedAt,
    });

  if (error) {
    throw new Error(
      `Unable to update progress for ${userId} (${assignment.task.id}): ${error.message}`,
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
  supabase: SupabaseClientLike,
  userId: string,
  conventionId: string,
  day: string,
  assignments: DailyAssignment[],
  eventTimestampIso: string,
  timezone: string,
): Promise<void> {
  if (assignments.length === 0) return;

  const { data, error } = await supabase
    .from("user_daily_progress")
    .select("task_id, is_completed, completed_at")
    .eq("user_id", userId)
    .eq("convention_id", conventionId)
    .eq("day", day);

  if (error) {
    throw new Error(`Unable to verify daily completion: ${error.message}`);
  }

  const completionMap = new Map<string, { is_completed: boolean; completed_at: string | null }>();
  for (const row of data ?? []) {
    completionMap.set(row.task_id as string, {
      is_completed: Boolean(row.is_completed),
      completed_at: (row.completed_at as string | null) ?? null,
    });
  }

  const allComplete = assignments.every((assignment) =>
    completionMap.get(assignment.task.id)?.is_completed === true,
  );

  if (!allComplete) {
    return;
  }

  const { data: streakRow, error: streakError } = await supabase
    .from("user_daily_streaks")
    .select("current_streak, best_streak, last_completed_day")
    .eq("user_id", userId)
    .eq("convention_id", conventionId)
    .maybeSingle();

  if (streakError) {
    throw new Error(`Unable to load daily streak: ${streakError.message}`);
  }

  if (streakRow?.last_completed_day === day) {
    return;
  }

  const prevDay = previousDayLocal(day, timezone);
  const currentStreakPrior = streakRow?.current_streak ?? 0;
  const bestStreakPrior = streakRow?.best_streak ?? 0;
  const lastCompletedDay = streakRow?.last_completed_day ?? null;

  const newCurrentStreak = lastCompletedDay === prevDay ? currentStreakPrior + 1 : 1;
  const newBestStreak = Math.max(bestStreakPrior, newCurrentStreak);

  const { error: upsertError } = await supabase
    .from("user_daily_streaks")
    .upsert({
      user_id: userId,
      convention_id: conventionId,
      current_streak: newCurrentStreak,
      best_streak: newBestStreak,
      last_completed_day: day,
    });

  if (upsertError) {
    throw new Error(`Unable to update daily streak: ${upsertError.message}`);
  }
}

async function fetchCatchesForDay(
  supabase: SupabaseClientLike,
  userId: string,
  conventionId: string,
  day: string,
  timezone: string,
): Promise<{ total: number; distinct: number }> {
  const { startUtc, endUtc } = getDayRangeUtc(day, timezone);
  const { data, error } = await supabase
    .from("catches")
    .select("fursuit_id")
    .eq("catcher_id", userId)
    .eq("convention_id", conventionId)
    .gte("caught_at", startUtc)
    .lt("caught_at", endUtc);

  if (error) {
    throw new Error(`Unable to load catches: ${error.message}`);
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

async function fetchCatchContext(
  supabase: SupabaseClientLike,
  catchId: string,
): Promise<{ catcher_id: string | null; convention_id: string | null } | null> {
  const { data, error } = await supabase
    .from("catches")
    .select("catcher_id, convention_id")
    .eq("id", catchId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load catch ${catchId}: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    catcher_id: (data.catcher_id as string | null) ?? null,
    convention_id: (data.convention_id as string | null) ?? null,
  };
}

async function processCatchDailyTasks(
  supabase: SupabaseClientLike,
  event: AchievementEvent,
  logger: LoggerLike,
): Promise<void> {
  const payload = event.payload as CatchEventPayload;
  const catchId = payload?.catch_id;
  if (!catchId) {
    logger.warn(`[daily] Catch event ${event.id} missing catch_id`);
    return;
  }

  const catchContext = await fetchCatchContext(supabase, catchId);
  if (!catchContext) {
    logger.warn(`[daily] Catch ${catchId} not found; skipping`);
    return;
  }

  const userId = catchContext.catcher_id;
  if (!userId) {
    logger.warn(`[daily] Catch ${catchId} missing catcher_id`);
    return;
  }

  const conventionId = catchContext.convention_id;
  if (!conventionId) {
    logger.debug(`[daily] Catch ${catchId} has no convention; skipping`);
    return;
  }

  const { timezone } = await getConventionInfo(supabase, conventionId);
  const eventTimestampIso = determineEventTimestamp(event);
  const day = getLocalDayFromTimestamp(eventTimestampIso, timezone);
  const assignments = await loadDailyAssignments(supabase, conventionId, day);

  if (assignments.length === 0) {
    logger.debug(`[daily] No assignments for ${day} (convention ${conventionId})`);
    return;
  }

  const relevantAssignments = assignments.filter((assignment) => assignment.task.kind === "catch");
  if (relevantAssignments.length === 0) {
    return;
  }

  const stats = await fetchCatchesForDay(supabase, userId, conventionId, day, timezone);
  if (stats.total === 0 && stats.distinct === 0) {
    return;
  }

  const taskIds = relevantAssignments.map((assignment) => assignment.task.id);
  const progressMap = await fetchProgressMap(supabase, userId, conventionId, day, taskIds);

  let changed = false;
  for (const assignment of relevantAssignments) {
    const metadata = (assignment.task.metadata ?? {}) as { distinct?: unknown };
    const requiresDistinct = metadata?.distinct === true;
    const absoluteCount = requiresDistinct ? stats.distinct : stats.total;
    if (absoluteCount === 0) {
      continue;
    }

    const updated = await upsertProgress(
      supabase,
      userId,
      conventionId,
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
    await ensureAllTasksCompleted(
      supabase,
      userId,
      conventionId,
      day,
      assignments,
      eventTimestampIso,
      timezone,
    );
  }
}

async function processLeaderboardDailyTasks(
  supabase: SupabaseClientLike,
  event: AchievementEvent,
  logger: LoggerLike,
): Promise<void> {
  const payload = event.payload as { user_id?: string | null; convention_id?: string | null } | null;
  const userId = payload?.user_id ?? null;
  const conventionId = payload?.convention_id ?? null;

  if (!userId || !conventionId) {
    logger.warn(`[daily] Leaderboard refresh event ${event.id} missing identifiers`);
    return;
  }

  const { timezone } = await getConventionInfo(supabase, conventionId);
  const eventTimestampIso = determineEventTimestamp(event);
  const day = getLocalDayFromTimestamp(eventTimestampIso, timezone);
  const assignments = await loadDailyAssignments(supabase, conventionId, day);

  if (assignments.length === 0) {
    logger.debug(`[daily] No assignments for ${day} (convention ${conventionId})`);
    return;
  }

  const relevantAssignments = assignments.filter((assignment) => assignment.task.kind === "leaderboard");
  if (relevantAssignments.length === 0) {
    return;
  }

  const taskIds = relevantAssignments.map((assignment) => assignment.task.id);
  const progressMap = await fetchProgressMap(supabase, userId, conventionId, day, taskIds);

  let changed = false;
  for (const assignment of relevantAssignments) {
    const existing = progressMap.get(assignment.task.id);
    const nextCount = Math.min((existing?.current_count ?? 0) + 1, assignment.task.requirement);

    const updated = await upsertProgress(
      supabase,
      userId,
      conventionId,
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
    await ensureAllTasksCompleted(
      supabase,
      userId,
      conventionId,
      day,
      assignments,
      eventTimestampIso,
      timezone,
    );
  }
}

export async function processDailyTasksForEvent({ event, supabase, logger = console }: ProcessContext) {
  try {
    switch (event.event_type) {
      case "catch.created":
        await processCatchDailyTasks(supabase, event, logger);
        break;
      case "leaderboard.refreshed":
        await processLeaderboardDailyTasks(supabase, event, logger);
        break;
      default:
        break;
    }
  } catch (error) {
    logger.error(`[daily] Failed processing daily tasks for event ${event.id}`, error);
  }
}
