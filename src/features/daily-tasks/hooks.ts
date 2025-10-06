import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { supabase } from '../../lib/supabase';
import type { DailyTasksSummary, DailyTaskProgress } from './api/dailyTasks';
import { fetchDailyTasks } from './api/dailyTasks';

const DAILY_TASKS_QUERY_KEY = 'daily-tasks';

export const dailyTasksQueryKey = (userId: string, conventionId: string) =>
  [DAILY_TASKS_QUERY_KEY, userId, conventionId] as const;

type ProgressPayload = {
  task_id: string;
  user_id: string;
  day: string;
  convention_id: string;
  current_count: number;
  is_completed: boolean;
  completed_at: string | null;
};

const MILLISECONDS_IN_SECOND = 1000;

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

function useDailyTasksRealtime(userId: string | null, conventionId: string | null, enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || !conventionId || !enabled) {
      return;
    }

    const channelName = `daily-tasks:user:${userId}:convention:${conventionId}`;
    const queryKey = dailyTasksQueryKey(userId, conventionId);

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
        (payload: RealtimePostgresChangesPayload<ProgressPayload>) => {
          const row = (payload.new ?? {}) as Partial<ProgressPayload>;
          if (row.convention_id !== conventionId) {
            return;
          }
          invalidate();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_assignments',
          filter: `convention_id=eq.${conventionId}`,
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
  }, [userId, conventionId, enabled, queryClient]);
}

export function useDailyTasks(userId: string | null, conventionId: string | null) {
  const now = useTicker();
  const enabled = Boolean(userId && conventionId);

  const query = useQuery<DailyTasksSummary, Error>({
    queryKey: userId && conventionId ? dailyTasksQueryKey(userId, conventionId) : [DAILY_TASKS_QUERY_KEY],
    enabled,
    queryFn: () => fetchDailyTasks({ userId: userId!, conventionId: conventionId! }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (previousData) => previousData,
  });

  useDailyTasksRealtime(userId, conventionId, enabled);

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

  return {
    ...query,
    countdown,
    resetAt,
    millisecondsUntilReset,
  };
}

export type { DailyTasksSummary, DailyTaskProgress };
