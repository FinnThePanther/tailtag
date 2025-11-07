import { supabaseFetch } from "./supabaseClient";
import type { ConventionInfo, Env, EventRecord } from "./types";

type DailyTaskMetadataFilter = {
  path: string;
  equals?: unknown;
  notEquals?: unknown;
  in?: unknown[];
  notIn?: unknown[];
  exists?: boolean;
};

type DailyTaskMetadata = {
  eventType: string;
  metric: "total" | "unique";
  uniqueBy?: string;
  includeTutorialCatches: boolean;
  filters: DailyTaskMetadataFilter[];
};

type DailyAssignmentRecord = {
  id: string;
  day: string;
  position: number;
  convention_id: string;
  task: {
    id: string;
    name: string;
    description: string;
    kind: string;
    requirement: number;
    metadata: Record<string, unknown> | null;
    is_active?: boolean | null;
  } | null;
};

type DailyTaskDefinition = {
  assignmentId: string;
  taskId: string;
  day: string;
  position: number;
  conventionId: string;
  name: string;
  requirement: number;
  kind: string;
  metadata: DailyTaskMetadata;
};

type ProgressRow = {
  task_id: string;
  current_count: number;
  is_completed: boolean;
  completed_at: string | null;
};

type StreakRow = {
  current_streak: number;
  best_streak: number;
  last_completed_day: string | null;
};

type NormalizedEvent = {
  event_id: string;
  occurred_at: string;
  convention_id: string | null;
  payload: Record<string, unknown>;
};

type ProcessDailyTaskEventOptions = {
  env: Env;
  event: EventRecord;
  userId: string;
  conventionId: string;
  conventionInfo?: ConventionInfo | null;
  occurredAt?: string;
};

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

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
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
  });
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function getLocalDay(now: Date, timezone: string): {
  day: string;
  year: number;
  month: number;
  dayNumber: number;
} {
  const formatter = getDateFormatter(timezone);
  const parts = formatter.formatToParts(now);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const dayNumber = Number(lookup.day);
  return {
    day: `${year}-${pad(month)}-${pad(dayNumber)}`,
    year,
    month,
    dayNumber,
  };
}

function getOffsetMilliseconds(timestamp: number, timezone: string): number {
  const date = new Date(timestamp);
  const formatter = getDateTimeFormatter(timezone);
  const parts = formatter.formatToParts(date);
  const timeZoneName = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = timeZoneName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
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

function computeLocalDayRange(occurredAtIso: string, timezone: string) {
  const occurred = new Date(occurredAtIso);
  const localDay = getLocalDay(occurred, timezone);
  const startUtc = zonedTimeToUtc(timezone, localDay.year, localDay.month, localDay.dayNumber);
  const endUtc = zonedTimeToUtc(timezone, localDay.year, localDay.month, localDay.dayNumber + 1);

  return {
    localDayKey: localDay.day,
    windowStartIso: startUtc.toISOString(),
    windowEndIso: endUtc.toISOString(),
  };
}

function ensureConventionTimezone(info: ConventionInfo | null): string {
  if (info?.timezone && info.timezone.length > 0) {
    return info.timezone;
  }
  return "UTC";
}

function coerceTaskMetadata(raw: unknown): DailyTaskMetadata {
  if (!raw || typeof raw !== "object") {
    return {
      eventType: "catch_performed",
      metric: "total",
      includeTutorialCatches: false,
      filters: [],
    };
  }

  const record = raw as Record<string, unknown>;
  const eventTypeRaw = record.eventType ?? record.event_type ?? record.trigger ?? null;
  const metricRaw = record.metric ?? record.counter ?? null;
  const uniqueByRaw = record.uniqueBy ?? record.unique_by ?? null;
  const includeTutorialRaw = record.includeTutorial ?? record.include_tutorial ?? record.includeTutorialCatches;
  const filtersRaw = record.filters;

  const metadata: DailyTaskMetadata = {
    eventType: typeof eventTypeRaw === "string" && eventTypeRaw.length > 0
      ? eventTypeRaw
      : "catch_performed",
    metric: metricRaw === "unique" ? "unique" : "total",
    uniqueBy: typeof uniqueByRaw === "string" && uniqueByRaw.length > 0 ? uniqueByRaw : undefined,
    includeTutorialCatches: includeTutorialRaw === true,
    filters: Array.isArray(filtersRaw)
      ? (filtersRaw as unknown[])
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          const filterRecord = item as Record<string, unknown>;
          const path = typeof filterRecord.path === "string" ? filterRecord.path : null;
          if (!path) {
            return null;
          }
          const filter: DailyTaskMetadataFilter = { path };
          if ("equals" in filterRecord) filter.equals = filterRecord.equals;
          if ("notEquals" in filterRecord) filter.notEquals = filterRecord.notEquals;
          if ("in" in filterRecord && Array.isArray(filterRecord.in)) filter.in = filterRecord.in;
          if ("notIn" in filterRecord && Array.isArray(filterRecord.notIn)) filter.notIn = filterRecord.notIn;
          if ("exists" in filterRecord) filter.exists = filterRecord.exists === true;
          return filter;
        })
        .filter((entry): entry is DailyTaskMetadataFilter => Boolean(entry))
      : [],
  };

  return metadata;
}

function normalizeAssignment(record: DailyAssignmentRecord): DailyTaskDefinition | null {
  if (!record.task) {
    return null;
  }

  if (record.task.is_active === false) {
    return null;
  }

  return {
    assignmentId: record.id,
    taskId: record.task.id,
    day: record.day,
    position: record.position,
    conventionId: record.convention_id,
    name: record.task.name,
    requirement: Math.max(0, record.task.requirement ?? 0),
    kind: record.task.kind,
    metadata: coerceTaskMetadata(record.task.metadata ?? null),
  };
}

async function fetchAssignmentsForDay(
  env: Env,
  conventionId: string,
  day: string,
): Promise<DailyTaskDefinition[]> {
  const params = new URLSearchParams({
    select:
      "id,day,position,convention_id,task:daily_tasks(id,name,description,kind,requirement,metadata,is_active)",
    convention_id: `eq.${conventionId}`,
    day: `eq.${day}`,
    order: "position.asc",
  });

  const response = await supabaseFetch(
    env,
    `/rest/v1/daily_assignments?${params.toString()}`,
  );
  const rows = (await response.json()) as DailyAssignmentRecord[];
  return rows
    .map((row) => normalizeAssignment(row))
    .filter((assignment): assignment is DailyTaskDefinition => Boolean(assignment));
}

async function fetchUserProgress(
  env: Env,
  userId: string,
  conventionId: string,
  day: string,
): Promise<Map<string, ProgressRow>> {
  const params = new URLSearchParams({
    select: "task_id,current_count,is_completed,completed_at",
    user_id: `eq.${userId}`,
    convention_id: `eq.${conventionId}`,
    day: `eq.${day}`,
  });

  const response = await supabaseFetch(
    env,
    `/rest/v1/user_daily_progress?${params.toString()}`,
  );
  const rows = (await response.json()) as ProgressRow[];
  const map = new Map<string, ProgressRow>();
  for (const row of rows) {
    map.set(row.task_id, row);
  }
  return map;
}

async function fetchEventsForType(
  env: Env,
  userId: string,
  conventionId: string,
  eventType: string,
  windowStartIso: string,
  windowEndIso: string,
): Promise<NormalizedEvent[]> {
  const params = new URLSearchParams({
    select: "event_id,occurred_at,convention_id,payload",
    type: `eq.${eventType}`,
    user_id: `eq.${userId}`,
    order: "occurred_at.asc",
  });
  params.append("and", `(occurred_at.gte.${windowStartIso},occurred_at.lt.${windowEndIso})`);

  const response = await supabaseFetch(
    env,
    `/rest/v1/events?${params.toString()}`,
  );
  const rows = (await response.json()) as {
    event_id: string;
    occurred_at: string;
    convention_id: string | null;
    payload: Record<string, unknown> | null;
  }[];

  const normalized = rows.map((row) => ({
    event_id: row.event_id,
    occurred_at: row.occurred_at,
    convention_id: row.convention_id,
    payload: row.payload ?? {},
  }));

  return normalized.filter((row) => {
    if (row.convention_id === conventionId) {
      return true;
    }

    const payload = row.payload as Record<string, unknown>;
    const payloadConventionIdRaw = payload["convention_id"];
    const payloadConventionId = typeof payloadConventionIdRaw === "string"
      ? payloadConventionIdRaw
      : null;
    if (payloadConventionId === conventionId) {
      return true;
    }

    const payloadConventionIdsRaw = payload["convention_ids"];
    const conventionIds = Array.isArray(payloadConventionIdsRaw)
      ? payloadConventionIdsRaw.map((value) => {
        if (typeof value === "string") return value;
        if (typeof value === "number") return String(value);
        return null;
      }).filter((value): value is string => Boolean(value))
      : [];

    return conventionIds.includes(conventionId);
  });
}

function getValueAtPath(source: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".").filter((segment) => segment.length > 0);
  let current: unknown = source;

  for (const segment of segments) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    if (!(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function passesFilter(event: NormalizedEvent, filter: DailyTaskMetadataFilter): boolean {
  const value = getValueAtPath(event as unknown as Record<string, unknown>, filter.path);

  if (filter.exists !== undefined) {
    const exists = value !== undefined && value !== null;
    if (exists !== filter.exists) {
      return false;
    }
  }

  if ("equals" in filter && filter.equals !== undefined) {
    if (value !== filter.equals) {
      return false;
    }
  }

  if ("notEquals" in filter && filter.notEquals !== undefined) {
    if (value === filter.notEquals) {
      return false;
    }
  }

  if (filter.in && Array.isArray(filter.in) && filter.in.length > 0) {
    if (!filter.in.some((candidate) => candidate === value)) {
      return false;
    }
  }

  if (filter.notIn && Array.isArray(filter.notIn) && filter.notIn.length > 0) {
    if (filter.notIn.some((candidate) => candidate === value)) {
      return false;
    }
  }

  return true;
}

function filterEvents(
  events: NormalizedEvent[],
  metadata: DailyTaskMetadata,
): NormalizedEvent[] {
  let filtered = events;

  if (!metadata.includeTutorialCatches && metadata.eventType === "catch_performed") {
    filtered = filtered.filter((event) => {
      const tutorialFlag = getValueAtPath(event as unknown as Record<string, unknown>, "payload.is_tutorial");
      return !(tutorialFlag === true || tutorialFlag === "true");
    });
  }

  if (metadata.filters.length === 0) {
    return filtered;
  }

  return filtered.filter((event) => metadata.filters.every((filter) => passesFilter(event, filter)));
}

function evaluateMetric(
  events: NormalizedEvent[],
  metadata: DailyTaskMetadata,
): number {
  const filtered = filterEvents(events, metadata);

  if (metadata.metric === "unique" && metadata.uniqueBy) {
    const seen = new Set<string>();
    for (const event of filtered) {
      const value = getValueAtPath(event as unknown as Record<string, unknown>, metadata.uniqueBy);
      if (value === undefined || value === null) {
        continue;
      }
      try {
        seen.add(typeof value === "string" ? value : JSON.stringify(value));
      } catch {
        // fallback: skip values that cannot be stringified
      }
    }
    return seen.size;
  }

  return filtered.length;
}

async function upsertUserProgress(
  env: Env,
  rows: {
    user_id: string;
    convention_id: string;
    day: string;
    task_id: string;
    current_count: number;
    is_completed: boolean;
    completed_at: string | null;
  }[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  await supabaseFetch(env, "/rest/v1/user_daily_progress", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
}

async function fetchStreak(
  env: Env,
  userId: string,
  conventionId: string,
): Promise<StreakRow | null> {
  const params = new URLSearchParams({
    select: "current_streak,best_streak,last_completed_day",
    user_id: `eq.${userId}`,
    convention_id: `eq.${conventionId}`,
    limit: "1",
  });

  const response = await supabaseFetch(
    env,
    `/rest/v1/user_daily_streaks?${params.toString()}`,
  );
  const rows = (await response.json()) as StreakRow[];
  return rows?.[0] ?? null;
}

async function upsertStreak(
  env: Env,
  payload: {
    user_id: string;
    convention_id: string;
    current_streak: number;
    best_streak: number;
    last_completed_day: string;
  },
): Promise<void> {
  await supabaseFetch(env, "/rest/v1/user_daily_streaks", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([payload]),
  });
}

async function insertNotifications(
  env: Env,
  notifications: {
    user_id: string;
    type: string;
    payload: Record<string, unknown>;
  }[],
): Promise<void> {
  if (notifications.length === 0) {
    return;
  }

  await supabaseFetch(env, "/rest/v1/notifications", {
    method: "POST",
    body: JSON.stringify(notifications),
  });
}

function computePreviousDayKey(dayKey: string, timezone: string): string {
  const [yearStr, monthStr, dayStr] = dayKey.split("-");
  const date = zonedTimeToUtc(
    timezone,
    Number.parseInt(yearStr, 10),
    Number.parseInt(monthStr, 10),
    Number.parseInt(dayStr, 10),
  );
  const previous = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  const localDay = getLocalDay(previous, timezone);
  return localDay.day;
}

export async function processDailyTasksForEvent(
  options: ProcessDailyTaskEventOptions,
): Promise<void> {
  const {
    env,
    event,
    userId,
    conventionId,
    conventionInfo,
    occurredAt: occurredAtOverride,
  } = options;

  if (!conventionId) {
    return;
  }

  const timezone = ensureConventionTimezone(conventionInfo ?? null);
  const occurredAt = occurredAtOverride ?? event.occurred_at;

  const { localDayKey, windowStartIso, windowEndIso } = computeLocalDayRange(occurredAt, timezone);
  const assignments = await fetchAssignmentsForDay(env, conventionId, localDayKey);

  if (assignments.length === 0) {
    return;
  }

  const metadataByEventType = new Map<string, DailyTaskDefinition[]>();
  for (const assignment of assignments) {
    const list = metadataByEventType.get(assignment.metadata.eventType) ?? [];
    list.push(assignment);
    metadataByEventType.set(assignment.metadata.eventType, list);
  }

  const eventsByType = new Map<string, NormalizedEvent[]>();
  const eventTypes = Array.from(metadataByEventType.keys());
  const eventFetches = await Promise.all(
    eventTypes.map((eventType) =>
      fetchEventsForType(env, userId, conventionId, eventType, windowStartIso, windowEndIso)
        .then((events) => ({ eventType, events }))
        .catch((error) => {
          console.error("[dailyTasks] Failed fetching events for type", {
            eventType,
            error,
          });
          return { eventType, events: [] as NormalizedEvent[] };
        }),
    ),
  );

  for (const { eventType, events } of eventFetches) {
    eventsByType.set(eventType, events);
  }

  const progressMap = await fetchUserProgress(env, userId, conventionId, localDayKey);
  const upsertRows: {
    user_id: string;
    convention_id: string;
    day: string;
    task_id: string;
    current_count: number;
    is_completed: boolean;
    completed_at: string | null;
  }[] = [];
  const newlyCompletedNotifications: {
    user_id: string;
    type: string;
    payload: Record<string, unknown>;
  }[] = [];

  let previouslyAllComplete = assignments.every((assignment) => {
    const existing = progressMap.get(assignment.taskId);
    return existing?.is_completed === true;
  });

  let nowAllComplete = true;

  for (const assignment of assignments) {
    const events = eventsByType.get(assignment.metadata.eventType) ?? [];
    let count = evaluateMetric(events, assignment.metadata);

    const capped = Math.min(count, assignment.requirement);
    const existing = progressMap.get(assignment.taskId);
    const wasCompleted = existing?.is_completed === true;
    const shouldBeCompleted = capped >= assignment.requirement && assignment.requirement > 0;
    const completionTimestamp = shouldBeCompleted
      ? existing?.completed_at ?? occurredAt
      : null;

    if (
      !existing ||
      existing.current_count !== capped ||
      wasCompleted !== shouldBeCompleted ||
      existing.completed_at !== completionTimestamp
    ) {
      upsertRows.push({
        user_id: userId,
        convention_id: conventionId,
        day: localDayKey,
        task_id: assignment.taskId,
        current_count: capped,
        is_completed: shouldBeCompleted,
        completed_at: completionTimestamp,
      });
    }

    if (!existing?.is_completed && shouldBeCompleted) {
      newlyCompletedNotifications.push({
        user_id: userId,
        type: "daily_task_completed",
        payload: {
          event_id: event.event_id,
          task_id: assignment.taskId,
          day: localDayKey,
          convention_id: conventionId,
          task_name: assignment.name,
          requirement: assignment.requirement,
        },
      });
    }

    if (!shouldBeCompleted) {
      nowAllComplete = false;
    }
  }

  if (upsertRows.length > 0) {
    await upsertUserProgress(env, upsertRows);
  }

  if (newlyCompletedNotifications.length > 0) {
    await insertNotifications(env, newlyCompletedNotifications);
  }

  if (!nowAllComplete) {
    return;
  }

  if (previouslyAllComplete) {
    return;
  }

  const streakRow = await fetchStreak(env, userId, conventionId);
  const previousDayKey = computePreviousDayKey(localDayKey, timezone);

  let currentStreak = 1;
  let bestStreak = 1;

  if (streakRow) {
    if (streakRow.last_completed_day === localDayKey) {
      currentStreak = streakRow.current_streak;
      bestStreak = Math.max(streakRow.best_streak, currentStreak);
    } else if (streakRow.last_completed_day === previousDayKey) {
      currentStreak = (streakRow.current_streak ?? 0) + 1;
      bestStreak = Math.max(streakRow.best_streak ?? 0, currentStreak);
    } else {
      currentStreak = 1;
      bestStreak = Math.max(streakRow.best_streak ?? 0, 1);
    }
  }

  await upsertStreak(env, {
    user_id: userId,
    convention_id: conventionId,
    current_streak: currentStreak,
    best_streak: bestStreak,
    last_completed_day: localDayKey,
  });

  await insertNotifications(env, [
    {
      user_id: userId,
      type: "daily_all_complete",
      payload: {
        event_id: event.event_id,
        day: localDayKey,
        convention_id: conventionId,
        current_streak: currentStreak,
        best_streak: bestStreak,
      },
    },
  ]);
}

async function fetchConventionAttendees(
  env: Env,
  conventionId: string,
): Promise<string[]> {
  const params = new URLSearchParams({
    select: "user_id",
    convention_id: `eq.${conventionId}`,
  });

  const response = await supabaseFetch(
    env,
    `/rest/v1/profile_conventions?${params.toString()}`,
  );
  const rows = (await response.json()) as { user_id: string }[];
  return rows.map((row) => row.user_id).filter((id): id is string => typeof id === "string" && id.length > 0);
}

async function fetchConventionName(
  env: Env,
  conventionId: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    select: "name",
    id: `eq.${conventionId}`,
    limit: "1",
  });

  try {
    const response = await supabaseFetch(
      env,
      `/rest/v1/conventions?${params.toString()}`,
    );
    const rows = (await response.json()) as { name?: string | null }[];
    const record = rows?.[0];
    if (!record) return null;
    if (typeof record.name === "string" && record.name.trim().length > 0) {
      return record.name.trim();
    }
    return null;
  } catch (error) {
    console.error("[dailyTasks] Failed fetching convention name", {
      conventionId,
      error,
    });
    return null;
  }
}

async function notificationsForEvent(
  env: Env,
  eventId: string,
): Promise<Set<string>> {
  const params = new URLSearchParams({
    select: "user_id",
    type: "eq.daily_reset",
  });
  params.append("payload->>event_id", `eq.${eventId}`);

  try {
    const response = await supabaseFetch(
      env,
      `/rest/v1/notifications?${params.toString()}`,
    );
    const rows = (await response.json()) as { user_id: string }[];
    return new Set(rows.map((row) => row.user_id));
  } catch (error) {
    console.error("[dailyTasks] Failed to fetch existing daily_reset notifications", {
      event_id: eventId,
      error,
    });
    return new Set();
  }
}

export async function handleDailyResetEvent(
  env: Env,
  event: EventRecord,
): Promise<void> {
  const payload = event.payload as Record<string, unknown> | null;
  const conventionId = typeof payload?.convention_id === "string" ? payload.convention_id : event.convention_id;
  const day = typeof payload?.day === "string" ? payload.day : null;

  if (!conventionId || !day) {
    console.warn("[dailyTasks] daily_reset event missing convention/day", {
      event_id: event.event_id,
      convention_id: conventionId,
      day,
    });
    return;
  }

  const attendees = await fetchConventionAttendees(env, conventionId);
  if (attendees.length === 0) {
    console.info("[dailyTasks] No attendees for convention daily reset", {
      event_id: event.event_id,
      convention_id: conventionId,
    });
    return;
  }

  const alreadyNotified = await notificationsForEvent(env, event.event_id);
  const notifications: {
    user_id: string;
    type: string;
    payload: Record<string, unknown>;
  }[] = [];

  const conventionName = await fetchConventionName(env, conventionId);

  for (const userId of attendees) {
    if (alreadyNotified.has(userId)) {
      continue;
    }
    notifications.push({
      user_id: userId,
      type: "daily_reset",
      payload: {
        event_id: event.event_id,
        convention_id: conventionId,
        day,
        convention_name: conventionName,
      },
    });
  }

  if (notifications.length === 0) {
    return;
  }

  const batchSize = 500;
  for (let index = 0; index < notifications.length; index += batchSize) {
    const slice = notifications.slice(index, index + batchSize);
    await insertNotifications(env, slice);
  }
}
