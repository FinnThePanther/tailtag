import { supabaseRestFetch } from "./supabaseRest.ts";
import type { InsertableEventRow } from "./types.ts";

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

export type ProcessDailyTaskEventOptions = {
  event: InsertableEventRow;
  userId: string;
  conventionId: string;
  conventionInfo?: ConventionInfo | null;
  occurredAt?: string;
};

export type DailyTaskCompletion = {
  userId: string;
  conventionId: string;
  taskId: string;
  day: string;
  taskName: string;
  requirement: number;
};

export type DailyTaskProcessResult = {
  completions: DailyTaskCompletion[];
  allTasksCompleted: boolean;
  allTasksCompletionDay?: string;
  streak?: {
    current: number;
    best: number;
  };
};

type ConventionInfo = {
  startDate: string | null;
  timezone: string | null;
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

  const metadata: DailyTaskMetadata = {
    eventType: typeof eventTypeRaw === "string" ? eventTypeRaw : "catch_performed",
    metric: metricRaw === "unique" ? "unique" : "total",
    uniqueBy: typeof record.uniqueBy === "string" ? record.uniqueBy : undefined,
    includeTutorialCatches: record.includeTutorialCatches === true,
    filters: Array.isArray(record.filters) ? (record.filters as DailyTaskMetadataFilter[]) : [],
  };

  return metadata;
}

function applyFilters(events: NormalizedEvent[], filters: DailyTaskMetadataFilter[]): NormalizedEvent[] {
  if (filters.length === 0) {
    return events;
  }
  return events.filter((event) => {
    for (const filter of filters) {
      const value = filter.path.split(".").reduce<unknown>((acc, key) => {
        if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
          return (acc as Record<string, unknown>)[key];
        }
        return undefined;
      }, event);

      if (filter.equals !== undefined && value !== filter.equals) {
        return false;
      }
      if (filter.notEquals !== undefined && value === filter.notEquals) {
        return false;
      }
      if (filter.in && !filter.in.includes(value)) {
        return false;
      }
      if (filter.notIn && filter.notIn.includes(value)) {
        return false;
      }
      if (filter.exists === true && value === undefined) {
        return false;
      }
      if (filter.exists === false && value !== undefined) {
        return false;
      }
    }
    return true;
  });
}

function normalizeEvent(raw: Record<string, unknown>): NormalizedEvent {
  return {
    event_id: typeof raw.event_id === "string" ? raw.event_id : "",
    occurred_at: typeof raw.occurred_at === "string" ? raw.occurred_at : new Date().toISOString(),
    convention_id: typeof raw.convention_id === "string" ? raw.convention_id : null,
    payload: (raw.payload as Record<string, unknown> | null) ?? {},
  };
}

function evaluateMetric(events: NormalizedEvent[], metadata: DailyTaskMetadata): number {
  // Filter out tutorial catches if not explicitly included
  let processedEvents = events;
  if (!metadata.includeTutorialCatches) {
    processedEvents = events.filter((event) => {
      const tutorialValue = event.payload["is_tutorial"];
      const isTutorial = tutorialValue === true || (typeof tutorialValue === "string" && tutorialValue === "true");
      return !isTutorial;
    });
  }

  const filtered = applyFilters(processedEvents, metadata.filters);
  if (metadata.metric === "unique" && metadata.uniqueBy) {
    const seen = new Set<string>();
    for (const event of filtered) {
      const target = metadata.uniqueBy.split(".").reduce<unknown>((acc, key) => {
        if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
          return (acc as Record<string, unknown>)[key];
        }
        return undefined;
      }, event);
      if (typeof target === "string" && target.length > 0) {
        seen.add(target);
      }
    }
    return seen.size;
  }
  return filtered.length;
}

async function fetchAssignmentsForDay(
  conventionId: string,
  day: string,
): Promise<DailyTaskDefinition[]> {
  const params = new URLSearchParams({
    select: "id,day,position,convention_id,task:daily_tasks(id,name,description,kind,requirement,metadata,is_active)",
    convention_id: `eq.${conventionId}`,
    day: `eq.${day}`,
    order: "position.asc",
  });

  const response = await supabaseRestFetch(`/rest/v1/daily_assignments?${params.toString()}`);
  const rows = (await response.json()) as DailyAssignmentRecord[];

  return rows
    .filter((row) => row.task)
    .map((row) => ({
      assignmentId: row.id,
      taskId: row.task!.id,
      day: row.day,
      position: row.position,
      conventionId: row.convention_id,
      name: row.task!.name,
      requirement: row.task!.requirement,
      kind: row.task!.kind,
      metadata: coerceTaskMetadata(row.task!.metadata),
    }));
}

async function fetchEventsForType(
  userId: string,
  conventionId: string,
  eventType: string,
  startIso: string,
  endIso: string,
): Promise<NormalizedEvent[]> {
  const params = new URLSearchParams({
    select: "event_id,occurred_at,convention_id,payload",
    user_id: `eq.${userId}`,
  });

  params.append("convention_id", `eq.${conventionId}`);
  params.append("type", `eq.${eventType}`);
  params.append("occurred_at", `gte.${startIso}`);
  params.append("occurred_at", `lt.${endIso}`);
  params.append("order", "occurred_at.asc");

  const response = await supabaseRestFetch(`/rest/v1/events?${params.toString()}`);
  const rows = (await response.json()) as Record<string, unknown>[];
  return rows.map((row) => normalizeEvent(row));
}

async function fetchUserProgress(
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

  const response = await supabaseRestFetch(`/rest/v1/user_daily_progress?${params.toString()}`);
  const rows = (await response.json()) as ProgressRow[];
  return new Map(rows.map((row) => [row.task_id, row]));
}

async function fetchStreak(
  userId: string,
  conventionId: string,
): Promise<StreakRow | null> {
  const params = new URLSearchParams({
    select: "current_streak,best_streak,last_completed_day",
    user_id: `eq.${userId}`,
    convention_id: `eq.${conventionId}`,
    limit: "1",
  });

  const response = await supabaseRestFetch(`/rest/v1/user_daily_streaks?${params.toString()}`);
  const rows = (await response.json()) as StreakRow[];
  return rows?.[0] ?? null;
}

async function upsertUserProgress(rows: {
  user_id: string;
  convention_id: string;
  day: string;
  task_id: string;
  current_count: number;
  is_completed: boolean;
  completed_at: string | null;
}[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  await supabaseRestFetch("/rest/v1/user_daily_progress", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
}

async function upsertStreak(payload: {
  user_id: string;
  convention_id: string;
  current_streak: number;
  best_streak: number;
  last_completed_day: string;
}): Promise<void> {
  await supabaseRestFetch("/rest/v1/user_daily_streaks", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([payload]),
  });
}

async function insertNotifications(
  notifications: {
    user_id: string;
    type: string;
    payload: Record<string, unknown>;
  }[],
): Promise<void> {
  if (notifications.length === 0) {
    return;
  }

  await supabaseRestFetch("/rest/v1/notifications", {
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
): Promise<DailyTaskProcessResult> {
  const { event, userId, conventionId, conventionInfo, occurredAt: occurredAtOverride } = options;

  if (!conventionId) {
    return { completions: [], allTasksCompleted: false };
  }

  const timezone = ensureConventionTimezone(conventionInfo ?? null);
  const occurredAt = occurredAtOverride ?? event.occurred_at;

  const { localDayKey, windowStartIso, windowEndIso } = computeLocalDayRange(occurredAt, timezone);
  const assignments = await fetchAssignmentsForDay(conventionId, localDayKey);

  if (assignments.length === 0) {
    return { completions: [], allTasksCompleted: false };
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
      fetchEventsForType(userId, conventionId, eventType, windowStartIso, windowEndIso)
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

  const progressMap = await fetchUserProgress(userId, conventionId, localDayKey);
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
  const completions: DailyTaskCompletion[] = [];

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
      completions.push({
        userId,
        conventionId,
        taskId: assignment.taskId,
        day: localDayKey,
        taskName: assignment.name,
        requirement: assignment.requirement,
      });
    }

    if (!shouldBeCompleted) {
      nowAllComplete = false;
    }
  }

  if (upsertRows.length > 0) {
    await upsertUserProgress(upsertRows);
  }

  if (newlyCompletedNotifications.length > 0) {
    await insertNotifications(newlyCompletedNotifications);
  }

  if (!nowAllComplete) {
    return { completions, allTasksCompleted: false };
  }

  if (previouslyAllComplete) {
    return { completions, allTasksCompleted: false };
  }

  const streakRow = await fetchStreak(userId, conventionId);
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

  await upsertStreak({
    user_id: userId,
    convention_id: conventionId,
    current_streak: currentStreak,
    best_streak: bestStreak,
    last_completed_day: localDayKey,
  });

  await insertNotifications([
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

  return {
    completions,
    allTasksCompleted: true,
    allTasksCompletionDay: localDayKey,
    streak: {
      current: currentStreak,
      best: bestStreak,
    },
  };
}
