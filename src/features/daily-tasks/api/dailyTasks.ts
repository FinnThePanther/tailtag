import { supabase } from '../../../lib/supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../../lib/runtimeConfig';
import type {
  DailyAssignmentsRow,
  DailyTaskKind,
  DailyTasksRow,
  Json,
  UserDailyProgressRow,
  UserDailyStreaksRow,
} from '../../../types/database';
import { captureHandledMessage } from '../../../lib/sentry';

export type DailyTaskRecord = {
  id: string;
  name: string;
  description: string;
  kind: DailyTaskKind;
  requirement: number;
  metadata: Json;
  conventionId: string | null;
};

export type DailyTaskProgress = DailyTaskRecord & {
  position: number;
  currentCount: number;
  isCompleted: boolean;
  completedAt: string | null;
};

export type DailyTasksSummary = {
  day: string;
  tasks: DailyTaskProgress[];
  totalCount: number;
  completedCount: number;
  remainingCount: number;
  conventionId: string;
  timezone: string;
  resetAt: string;
  millisecondsUntilReset: number;
  streak: {
    current: number;
    best: number;
    lastCompletedDay: string | null;
  };
};

type FetchDailyTasksParams = {
  userId: string;
  conventionId: string;
};

type AssignmentRow = DailyAssignmentsRow & {
  task: DailyTasksRow | DailyTasksRow[] | null;
};

type ProgressRow = Pick<
  UserDailyProgressRow,
  'task_id' | 'current_count' | 'is_completed' | 'completed_at'
>;

type StreakRow = Pick<
  UserDailyStreaksRow,
  'current_streak' | 'best_streak' | 'last_completed_day'
>;

const EMPTY_STREAK = {
  current: 0,
  best: 0,
  lastCompletedDay: null as string | null,
};

type ConventionTimezoneRow = {
  id: string;
  timezone: string;
};

type AssignmentsQueryResult = {
  data: AssignmentRow[] | null;
  error: { message: string } | null;
};

const dateCache = new Map<string, Intl.DateTimeFormat>();

function getDateFormatter(timezone: string) {
  if (!dateCache.has(timezone)) {
    dateCache.set(
      timezone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    );
  }
  return dateCache.get(timezone)!;
}

function getDateTimeFormatter(timezone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'shortOffset',
  });
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
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
  const timeZoneName = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = timeZoneName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === '+' ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? '0');
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
  // Use toLocaleString to format a date in the target timezone, then parse it back
  // This handles DST and all timezone complexities automatically

  // Step 1: Create a reference date using the actual target time
  // IMPORTANT: Use the target hour/minute/second to get the correct offset for that specific time
  // (not noon) because DST transitions can cause different offsets at different times of day
  const referenceUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const referenceDate = new Date(referenceUtc);

  // Step 2: Get the offset by comparing UTC vs timezone rendering
  const utcStr = referenceDate.toLocaleString('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const tzStr = referenceDate.toLocaleString('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Parse both strings (format: "YYYY-MM-DD, HH:MM:SS")
  const utcParts = utcStr.match(/(\d{4})-(\d{2})-(\d{2}), (\d{2}):(\d{2}):(\d{2})/);
  const tzParts = tzStr.match(/(\d{4})-(\d{2})-(\d{2}), (\d{2}):(\d{2}):(\d{2})/);

  if (!utcParts || !tzParts) {
    // Fallback to original calculation
    const utcTimestamp = Date.UTC(year, month - 1, day, hour, minute, second);
    const offset = getOffsetMilliseconds(utcTimestamp, timezone);
    return new Date(utcTimestamp - offset);
  }

  const utcMillis = Date.UTC(
    Number(utcParts[1]), Number(utcParts[2]) - 1, Number(utcParts[3]),
    Number(utcParts[4]), Number(utcParts[5]), Number(utcParts[6])
  );

  const tzMillis = Date.UTC(
    Number(tzParts[1]), Number(tzParts[2]) - 1, Number(tzParts[3]),
    Number(tzParts[4]), Number(tzParts[5]), Number(tzParts[6])
  );

  const offsetMs = utcMillis - tzMillis;

  // Step 3: Apply the offset to our target local time
  const targetLocalMillis = Date.UTC(year, month - 1, day, hour, minute, second);
  return new Date(targetLocalMillis + offsetMs);
}

function computeResetMetadata(timezone: string, nowUtc: Date) {
  const localDay = getLocalDay(nowUtc, timezone);
  const nextResetDate = zonedTimeToUtc(
    timezone,
    localDay.year,
    localDay.month,
    localDay.dayNumber + 1,
  );
  const resetAtIso = nextResetDate.toISOString();
  const millisecondsUntilReset = Math.max(nextResetDate.getTime() - nowUtc.getTime(), 0);

  return {
    day: localDay.day,
    resetAtIso,
    millisecondsUntilReset,
  };
}

async function loadAssignments(conventionId: string, day: string): Promise<AssignmentsQueryResult> {
  const result = await supabase
    .from('daily_assignments')
    .select(
      'id, day, position, convention_id, task:daily_tasks(id, name, description, kind, requirement, metadata, is_active, convention_id)'
    )
    .eq('day', day)
    .eq('convention_id', conventionId)
    .order('position', { ascending: true });

  return {
    data: (result.data ?? null) as AssignmentRow[] | null,
    error: result.error ? { message: result.error.message } : null,
  };
}

async function ensureAssignmentsForDay(
  userId: string,
  conventionId: string,
  day: string,
  currentResult: AssignmentsQueryResult,
): Promise<AssignmentsQueryResult> {
  if ((currentResult.data?.length ?? 0) > 0) {
    return currentResult;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const supabaseUrl = SUPABASE_URL;
  const supabaseKey = SUPABASE_ANON_KEY;

  if (!accessToken || !supabaseUrl || !supabaseKey) {
    captureHandledMessage('Missing credentials for daily task rotation fallback', {
      scope: 'dailyTasks.ensureAssignmentsForDay',
      userId,
      conventionId,
      day,
      hasAccessToken: Boolean(accessToken),
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasSupabaseKey: Boolean(supabaseKey),
    }, 'warning');
    return currentResult;
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/rotate-dailys?convention_id=${encodeURIComponent(conventionId)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseKey,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }
    );

    if (!response.ok) {
      const responseBody = await response.text().catch(() => null);
      captureHandledMessage('Daily task rotation fallback failed', {
        scope: 'dailyTasks.ensureAssignmentsForDay',
        userId,
        conventionId,
        day,
        status: response.status,
        responseBody,
      }, 'warning');
      return currentResult;
    }

    captureHandledMessage('Daily task rotation fallback created missing assignments', {
      scope: 'dailyTasks.ensureAssignmentsForDay',
      userId,
      conventionId,
      day,
    }, 'info');

    return await loadAssignments(conventionId, day);
  } catch (error) {
    captureHandledMessage('Daily task rotation fallback threw', {
      scope: 'dailyTasks.ensureAssignmentsForDay',
      userId,
      conventionId,
      day,
      error: error instanceof Error ? error.message : String(error),
    }, 'warning');
    return currentResult;
  }
}

export async function fetchDailyTasks({
  userId,
  conventionId,
}: FetchDailyTasksParams): Promise<DailyTasksSummary> {
  const { data: conventionRow, error: conventionError } = await supabase
    .from('conventions')
    .select('id, timezone')
    .eq('id', conventionId)
    .maybeSingle();

  if (conventionError) {
    throw new Error(`We couldn't load convention info: ${conventionError.message}`);
  }

  if (!conventionRow) {
    captureHandledMessage('Convention missing when fetching daily tasks', {
      scope: 'dailyTasks.fetchDailyTasks',
      userId,
      conventionId,
    }, 'warning');
    throw new Error('That convention is no longer available.');
  }

  const convention = conventionRow as ConventionTimezoneRow;
  const timezone = convention.timezone ?? 'UTC';
  const nowUtc = new Date();
  const { day: localDay, resetAtIso, millisecondsUntilReset } = computeResetMetadata(
    timezone,
    nowUtc,
  );

  const progressPromise = supabase
    .from('user_daily_progress')
    .select('task_id, current_count, is_completed, completed_at')
    .eq('user_id', userId)
    .eq('day', localDay)
    .eq('convention_id', conventionId);

  const streakPromise = supabase
    .from('user_daily_streaks')
    .select('current_streak, best_streak, last_completed_day')
    .eq('user_id', userId)
    .eq('convention_id', conventionId)
    .maybeSingle();

  const [assignmentsResult, progressResult, streakResult] = await Promise.all([
    loadAssignments(conventionId, localDay),
    progressPromise,
    streakPromise,
  ]);

  if (assignmentsResult.error) {
    throw new Error(`We couldn't load today's tasks: ${assignmentsResult.error.message}`);
  }

  if (progressResult.error) {
    throw new Error(`We couldn't load your task progress: ${progressResult.error.message}`);
  }

  if (streakResult.error) {
    throw new Error(`We couldn't load your streak: ${streakResult.error.message}`);
  }

  const ensuredAssignmentsResult = await ensureAssignmentsForDay(
    userId,
    conventionId,
    localDay,
    assignmentsResult,
  );

  if (ensuredAssignmentsResult.error) {
    throw new Error(`We couldn't load today's tasks: ${ensuredAssignmentsResult.error.message}`);
  }

  const progressMap = new Map<string, ProgressRow>();
  for (const row of (progressResult.data ?? []) as ProgressRow[]) {
    progressMap.set(row.task_id, row);
  }

  const tasks: DailyTaskProgress[] = [];

  for (const row of (ensuredAssignmentsResult.data ?? []) as AssignmentRow[]) {
    const relation = row.task;
    const resolvedTask = Array.isArray(relation) ? relation[0] : relation;

    if (!resolvedTask || resolvedTask.is_active === false) {
      continue;
    }

    const progress = progressMap.get(resolvedTask.id);
    const currentCount = Math.max(progress?.current_count ?? 0, 0);
    const requirement = Math.max(resolvedTask.requirement ?? 0, 0);

    tasks.push({
      id: resolvedTask.id,
      name: resolvedTask.name,
      description: resolvedTask.description,
      kind: resolvedTask.kind,
      requirement,
      metadata: resolvedTask.metadata ?? ({} as Json),
      conventionId: (resolvedTask as any).convention_id ?? null,
      position: row.position,
      currentCount,
      isCompleted: progress?.is_completed ?? false,
      completedAt: progress?.completed_at ?? null,
    });
  }

  tasks.sort((a, b) => a.position - b.position);

  const totalCount = tasks.length;
  const completedCount = tasks.filter((task) => task.isCompleted).length;
  const remainingCount = Math.max(totalCount - completedCount, 0);

  const streakRow = (streakResult.data ?? null) as StreakRow | null;
  const streak = streakRow
    ? {
        current: streakRow.current_streak ?? 0,
        best: streakRow.best_streak ?? 0,
        lastCompletedDay: streakRow.last_completed_day ?? null,
      }
    : { ...EMPTY_STREAK };

  return {
    day: localDay,
    tasks,
    totalCount,
    completedCount,
    remainingCount,
    conventionId,
    timezone,
    resetAt: resetAtIso,
    millisecondsUntilReset,
    streak,
  } satisfies DailyTasksSummary;
}
