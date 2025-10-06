import { supabase } from '../../../lib/supabase';
import type {
  DailyAssignmentsRow,
  DailyTaskKind,
  DailyTasksRow,
  Json,
  UserDailyProgressRow,
  UserDailyStreaksRow,
} from '../../../types/database';

export type DailyTaskRecord = {
  id: string;
  name: string;
  description: string;
  kind: DailyTaskKind;
  requirement: number;
  metadata: Json;
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
  streak: {
    current: number;
    best: number;
    lastCompletedDay: string | null;
  };
};

type FetchDailyTasksParams = {
  day: string;
  userId: string;
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

export async function fetchDailyTasks({ day, userId }: FetchDailyTasksParams): Promise<DailyTasksSummary> {
  const assignmentsPromise = supabase
    .from('daily_assignments')
    .select(
      'id, day, position, task:daily_tasks(id, name, description, kind, requirement, metadata, is_active)'
    )
    .eq('day', day)
    .order('position', { ascending: true });

  const progressPromise = supabase
    .from('user_daily_progress')
    .select('task_id, current_count, is_completed, completed_at')
    .eq('user_id', userId)
    .eq('day', day);

  const streakPromise = supabase
    .from('user_daily_streaks')
    .select('current_streak, best_streak, last_completed_day')
    .eq('user_id', userId)
    .maybeSingle();

  const [assignmentsResult, progressResult, streakResult] = await Promise.all([
    assignmentsPromise,
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

  const progressMap = new Map<string, ProgressRow>();
  for (const row of (progressResult.data ?? []) as ProgressRow[]) {
    progressMap.set(row.task_id, row);
  }

  const tasks: DailyTaskProgress[] = [];

  for (const row of (assignmentsResult.data ?? []) as AssignmentRow[]) {
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
    day,
    tasks,
    totalCount,
    completedCount,
    remainingCount,
    streak,
  } satisfies DailyTasksSummary;
}
