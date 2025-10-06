import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { supabase } from '../../lib/supabase';
import type { DailyTasksSummary, DailyTaskProgress } from './api/dailyTasks';
import { fetchDailyTasks } from './api/dailyTasks';

const DAILY_TASKS_QUERY_KEY = 'daily-tasks';

export const dailyTasksQueryKey = (userId: string, day: string) =>
  [DAILY_TASKS_QUERY_KEY, userId, day] as const;

type ProgressPayload = {
  task_id: string;
  user_id: string;
  day: string;
  current_count: number;
  is_completed: boolean;
  completed_at: string | null;
};

const MILLISECONDS_IN_SECOND = 1000;
const MILLISECONDS_IN_MINUTE = 60 * MILLISECONDS_IN_SECOND;
const MILLISECONDS_IN_HOUR = 60 * MILLISECONDS_IN_MINUTE;

function useDailyTicker(intervalMs = MILLISECONDS_IN_SECOND) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}

function formatUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getNextUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

function formatCountdown(milliseconds: number): string {
  const clamped = Math.max(milliseconds, 0);

  const hours = Math.floor(clamped / MILLISECONDS_IN_HOUR);
  const minutes = Math.floor((clamped % MILLISECONDS_IN_HOUR) / MILLISECONDS_IN_MINUTE);
  const seconds = Math.floor((clamped % MILLISECONDS_IN_MINUTE) / MILLISECONDS_IN_SECOND);

  const pad = (value: number) => value.toString().padStart(2, '0');

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function useDailyTasksRealtime(userId: string | null, day: string, enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || !enabled) {
      return;
    }

    const channelName = `daily-tasks:user:${userId}:${day}`;
    const queryKey = dailyTasksQueryKey(userId, day);

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey });
    };

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_daily_progress',
          filter: `user_id=eq.${userId}`,
        },
        (_payload: RealtimePostgresChangesPayload<ProgressPayload>) => {
          invalidate();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_assignments',
          filter: `day=eq.${day}`,
        },
        () => {
          invalidate();
        }
      );

    channel.subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' && error) {
        console.error('Daily tasks realtime channel error', error);
      }
    });

    return () => {
      channel
        .unsubscribe()
        .catch((unsubscribeError) => {
          console.error('Failed to unsubscribe from daily tasks channel', unsubscribeError);
        })
        .finally(() => {
          supabase.removeChannel(channel);
        });
    };
  }, [userId, day, enabled, queryClient]);
}

function buildGuestKey(day: string): QueryKey {
  return [DAILY_TASKS_QUERY_KEY, 'guest', day];
}

export function useDailyTasks(userId: string | null) {
  const now = useDailyTicker();
  const day = useMemo(() => formatUtcDay(now), [now]);
  const nextResetAt = useMemo(() => getNextUtcMidnight(now), [now]);
  const millisecondsUntilReset = Math.max(nextResetAt.getTime() - now.getTime(), 0);
  const countdownLabel = formatCountdown(millisecondsUntilReset);

  const enabled = Boolean(userId);
  const queryKey = useMemo(
    () => (userId ? dailyTasksQueryKey(userId, day) : buildGuestKey(day)),
    [userId, day]
  );

  const query = useQuery<DailyTasksSummary, Error>({
    queryKey,
    enabled,
    queryFn: () => fetchDailyTasks({ day, userId: userId! }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (previousData) => previousData,
  });

  useDailyTasksRealtime(userId, day, enabled);

  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId || !enabled) {
      return;
    }

    if (millisecondsUntilReset <= 0) {
      void queryClient.invalidateQueries({ queryKey: dailyTasksQueryKey(userId, day) });
      return;
    }

    const timeout = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: dailyTasksQueryKey(userId, formatUtcDay(new Date())) });
    }, millisecondsUntilReset + MILLISECONDS_IN_SECOND);

    return () => {
      clearTimeout(timeout);
    };
  }, [userId, enabled, millisecondsUntilReset, queryClient, day]);

  return {
    ...query,
    day,
    countdown: countdownLabel,
    resetAt: nextResetAt,
    millisecondsUntilReset,
  };
}

export type { DailyTasksSummary, DailyTaskProgress };
