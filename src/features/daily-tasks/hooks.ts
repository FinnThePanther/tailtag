import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

type PersistedToastState = {
  dayKey: string | null;
  completed: string[];
  allCompleteNotified: boolean;
};

const DAILY_TASK_TOAST_STORAGE_PREFIX = '@daily-task-toasts:';

const storageKeyForState = (stateKey: string) =>
  `${DAILY_TASK_TOAST_STORAGE_PREFIX}${stateKey}`;

const serializeToastState = (state: ToastState): PersistedToastState => ({
  dayKey: state.dayKey,
  completed: Array.from(state.completed),
  allCompleteNotified: state.allCompleteNotified,
});

const hydrateToastState = (input: PersistedToastState | null): ToastState | null => {
  if (!input) {
    return null;
  }

  const completedList = Array.isArray(input.completed) ? input.completed : [];

  return {
    dayKey: input.dayKey ?? null,
    completed: new Set(completedList),
    allCompleteNotified: Boolean(input.allCompleteNotified),
  };
};

const persistToastState = async (stateKey: string, state: ToastState) => {
  try {
    const payload = serializeToastState(state);
    await AsyncStorage.setItem(storageKeyForState(stateKey), JSON.stringify(payload));
  } catch (error) {
    console.warn('failed to persist daily task toast state', error);
  }
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
  const stateKey = userId && conventionId ? `${userId}:${conventionId}` : null;
  const [isToastStateReady, setToastStateReady] = useState<boolean>(
    () => Boolean(stateKey && dailyTaskToastStateMap.has(stateKey)),
  );

  useEffect(() => {
    if (!stateKey) {
      setToastStateReady(false);
      return;
    }

    if (dailyTaskToastStateMap.has(stateKey)) {
      setToastStateReady(true);
      return;
    }

    let isCancelled = false;
    setToastStateReady(false);

    (async () => {
      try {
        const storedRaw = await AsyncStorage.getItem(storageKeyForState(stateKey));
        if (isCancelled) {
          return;
        }
        if (storedRaw) {
          try {
            const parsed = JSON.parse(storedRaw) as PersistedToastState;
            const hydrated = hydrateToastState(parsed);
            if (hydrated) {
              dailyTaskToastStateMap.set(stateKey, hydrated);
            }
          } catch (parseError) {
            console.warn('failed to parse daily task toast state', parseError);
          }
        }
      } catch (error) {
        console.warn('failed to load daily task toast state', error);
      } finally {
        if (!isCancelled) {
          setToastStateReady(true);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [stateKey]);

  const query = useQuery<DailyTasksSummary, Error>({
    queryKey: userId && conventionId ? dailyTasksQueryKey(userId, conventionId) : [DAILY_TASKS_QUERY_KEY],
    enabled,
    queryFn: () => fetchDailyTasks({ userId: userId!, conventionId: conventionId! }),
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: (query) => {
      const resetAtValue = (query.state.data as DailyTasksSummary | undefined)?.resetAt ?? null;
      if (!resetAtValue) return false;
      const msUntilReset = new Date(resetAtValue).getTime() - Date.now();
      if (msUntilReset <= 0) return 60_000;
      return Math.min(Math.max(msUntilReset, 30_000), 60_000);
    },
    refetchIntervalInBackground: true,
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
    if (!isToastStateReady || !enabled || !userId || !stateKey) {
      return;
    }

    const summary = query.data;
    if (!summary) {
      return;
    }

    const dayKey = `${summary.conventionId}:${summary.day}`;
    const completedTaskIds = summary.tasks
      .filter((task) => task.isCompleted)
      .map((task) => task.id);
    const allComplete = summary.tasks.length > 0 && summary.tasks.every((task) => task.isCompleted);

    let state = dailyTaskToastStateMap.get(stateKey);
    let stateChanged = false;

    if (!state) {
      state = { dayKey, completed: new Set(completedTaskIds), allCompleteNotified: allComplete };
      dailyTaskToastStateMap.set(stateKey, state);
      stateChanged = true;
    } else if (state.dayKey !== dayKey) {
      state.dayKey = dayKey;
      state.completed = new Set(completedTaskIds);
      state.allCompleteNotified = allComplete;
      stateChanged = true;
    }

    for (const task of summary.tasks) {
      if (!task.isCompleted) {
        continue;
      }

      if (state.completed.has(task.id)) {
        continue;
      }

      state.completed.add(task.id);
      stateChanged = true;

      if (!suppressToasts) {
        showToast(`Daily task complete: ${task.name}`);
      }
    }

    if (allComplete && !state.allCompleteNotified) {
      state.allCompleteNotified = true;
      stateChanged = true;

      if (!suppressToasts) {
        const streak = summary.streak?.current ?? 0;
        const message = streak > 0
          ? `All daily tasks complete! Current streak: ${streak}`
          : 'All daily tasks complete!';
        showToast(message);
      }
    } else if (!allComplete && state.allCompleteNotified) {
      state.allCompleteNotified = false;
      stateChanged = true;
    }

    if (stateChanged) {
      void persistToastState(stateKey, state);
    }
  }, [enabled, isToastStateReady, query.data, showToast, stateKey, suppressToasts, userId]);

  return {
    ...query,
    countdown,
    resetAt,
    millisecondsUntilReset,
  };
}
