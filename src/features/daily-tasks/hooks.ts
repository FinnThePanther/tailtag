import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { DailyTasksSummary } from './api/dailyTasks';
import { fetchDailyTasks } from './api/dailyTasks';
import { useToast } from '../../hooks/useToast';

export const DAILY_TASKS_QUERY_KEY = 'daily-tasks';

export const dailyTasksQueryKey = (userId: string, conventionId: string) =>
  [DAILY_TASKS_QUERY_KEY, userId, conventionId] as const;

const MILLISECONDS_IN_SECOND = 1000;

type ToastState = {
  dayKey: string | null;
  completed: Set<string>;
  allCompleteNotified: boolean;
};

const dailyTaskToastStateMap = new Map<string, ToastState>();

function useTicker(intervalMs = MILLISECONDS_IN_SECOND) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}

type DailyTaskOptions = {
  suppressToasts?: boolean;
};

export function useDailyTasks(
  userId: string | null,
  conventionId: string | null,
  options: DailyTaskOptions = {},
) {
  const now = useTicker();
  const enabled = Boolean(userId && conventionId);
  const { showToast } = useToast();
  const suppressToasts = options.suppressToasts ?? false;

  const query = useQuery<DailyTasksSummary, Error>({
    queryKey: userId && conventionId ? dailyTasksQueryKey(userId, conventionId) : [DAILY_TASKS_QUERY_KEY],
    enabled,
    queryFn: () => fetchDailyTasks({ userId: userId!, conventionId: conventionId! }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (previousData) => previousData,
  });

  const resetAt = query.data?.resetAt ?? null;
  const millisecondsUntilReset = useMemo(() => {
    if (!resetAt) return 0;
    return Math.max(new Date(resetAt).getTime() - now, 0);
  }, [resetAt, now]);

  const countdown = useMemo(() => {
    const ms = millisecondsUntilReset;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600)
      .toString()
      .padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }, [millisecondsUntilReset]);

  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId || !conventionId || !enabled) {
      return;
    }

    if (millisecondsUntilReset <= 0) {
      void queryClient.invalidateQueries({ queryKey: dailyTasksQueryKey(userId, conventionId) });
    }
  }, [userId, conventionId, enabled, millisecondsUntilReset, queryClient]);

  useEffect(() => {
    if (!userId || !enabled) {
      if (userId) {
        const prefix = `${userId}:`;
        for (const key of Array.from(dailyTaskToastStateMap.keys())) {
          if (key.startsWith(prefix)) {
            dailyTaskToastStateMap.delete(key);
          }
        }
      }
      return;
    }

    const summary = query.data;
    if (!summary) {
      return;
    }

    if (suppressToasts) {
      const stateKey = `${userId}:${summary.conventionId}`;
      const dayKey = `${summary.conventionId}:${summary.day}`;
      const allComplete = summary.tasks.length > 0 && summary.tasks.every((task) => task.isCompleted);
      let state = dailyTaskToastStateMap.get(stateKey);
      if (!state) {
        state = { dayKey, completed: new Set(), allCompleteNotified: allComplete };
        dailyTaskToastStateMap.set(stateKey, state);
      } else if (state.dayKey !== dayKey) {
        state.dayKey = dayKey;
        state.completed = new Set();
        state.allCompleteNotified = allComplete;
      } else {
        state.allCompleteNotified = allComplete ? true : state.allCompleteNotified;
      }
      for (const task of summary.tasks) {
        if (task.isCompleted) {
          state.completed.add(task.id);
        }
      }
      return;
    }

    const stateKey = `${userId}:${summary.conventionId}`;
    const dayKey = `${summary.conventionId}:${summary.day}`;
    let state = dailyTaskToastStateMap.get(stateKey);
    if (!state) {
      state = { dayKey: null, completed: new Set(), allCompleteNotified: false };
      dailyTaskToastStateMap.set(stateKey, state);
    }

    if (state.dayKey !== dayKey) {
      state.dayKey = dayKey;
      state.completed = new Set();
      state.allCompleteNotified = false;
    }

    for (const task of summary.tasks) {
      if (!task.isCompleted) {
        continue;
      }

      if (!state.completed.has(task.id)) {
        state.completed.add(task.id);
        showToast(`Daily task complete: ${task.name}`);
      }
    }

    const allComplete = summary.tasks.length > 0 && summary.tasks.every((task) => task.isCompleted);
    if (allComplete && !state.allCompleteNotified) {
      state.allCompleteNotified = true;
      const streak = summary.streak?.current ?? 0;
      const message = streak > 0
        ? `All daily tasks complete! Current streak: ${streak}`
        : 'All daily tasks complete!';
      showToast(message);
    }
  }, [enabled, query.data, showToast, suppressToasts, userId]);

  return {
    ...query,
    countdown,
    resetAt,
    millisecondsUntilReset,
  };
}
