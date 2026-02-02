import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSegments } from 'expo-router';

import { useAuth } from '../../auth';
import { useAchievementUnlockToast } from '..';
import { achievementsStatusQueryKey, fetchAchievementStatus } from '../api/achievements';
import {
  subscribeToImmediateAchievementAwards,
  type ImmediateAchievementAward,
} from '../immediateAwardsBus';
import { supabase } from '../../../lib/supabase';
import { addMonitoringBreadcrumb, captureHandledException } from '../../../lib/sentry';
import { useToast } from '../../../hooks/useToast';
import { DAILY_TASKS_QUERY_KEY, dailyTasksQueryKey } from '../../daily-tasks';
import type { DailyTasksSummary } from '../../daily-tasks';
import type { AchievementWithStatus } from '../api/achievements';
import type { Json } from '../../../types/database';

/**
 * Mount once inside the app shell so achievement unlocks raise toasts in real time.
 */
export function AchievementToastManager() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const handleToast = useAchievementUnlockToast(userId);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activeUserRef = useRef<string | null>(null);
  const channelInstanceRef = useRef<string | null>(null);
  const hasPrimedChannelRef = useRef<boolean>(false);
  const routeRef = useRef<string>('');
  const processedNotificationIdsRef = useRef<Set<string>>(new Set());

  const segments = useSegments();

  useEffect(() => {
    routeRef.current = segments.join('/') || 'root';
  }, [segments]);

  const statusQueryKey = useMemo(
    () => (userId ? achievementsStatusQueryKey(userId) : ['achievements-status', 'guest'] as const),
    [userId],
  );

  useEffect(() => {
    if (!userId) {
      return;
    }

    // Ensure the realtime websocket is established as soon as the user is signed in.
    // On iOS simulators the lazy connect occasionally times out before the first
    // channel subscription finishes, so we proactively open the socket.
    try {
      supabase.realtime.connect();
      addMonitoringBreadcrumb({
        category: 'realtime',
        message: 'Realtime socket connect invoked',
        data: {
          userId,
          route: routeRef.current,
        },
      });
    } catch (connectError) {
      captureHandledException(connectError, {
        scope: 'notifications.realtime',
        action: 'connect',
        userId,
      });
    }
  }, [userId]);

  // Ensure we have achievement data loaded BEFORE realtime notifications start arriving
  // This prevents missing toast notifications when achievements are unlocked
  const { data: achievementStatus } = useQuery({
    queryKey: statusQueryKey,
    queryFn: () => fetchAchievementStatus(userId ?? ''),
    enabled: Boolean(userId),
    staleTime: 30_000, // 30 seconds - prevents unnecessary refetches during navigation
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: true,
    networkMode: 'always',
  });

  const unlockedSnapshotRef = useRef<Set<string>>(new Set());
  const hasPrimedSnapshotRef = useRef<boolean>(false);

  const applyImmediateAwardToCache = useCallback(
    (award: ImmediateAchievementAward): AchievementWithStatus | null => {
      const current = queryClient.getQueryData<AchievementWithStatus[] | undefined>(statusQueryKey);
      if (!current) {
        return null;
      }

      let resolved: AchievementWithStatus | null = null;
      const next = current.map((entry) => {
        const matches =
          (!!award.achievementId && entry.id === award.achievementId) ||
          entry.key === award.achievementKey;
        if (!matches) {
          return entry;
        }
        const unlockedAt = award.awardedAt ?? entry.unlockedAt ?? new Date().toISOString();
        resolved = {
          ...entry,
          unlocked: true,
          unlockedAt,
          context: award.context ?? entry.context,
        };
        return resolved;
      });

      if (!resolved) {
        return null;
      }

      queryClient.setQueryData(statusQueryKey, next);
      return resolved;
    },
    [queryClient, statusQueryKey],
  );

  useEffect(() => {
    if (!userId || !achievementStatus) {
      unlockedSnapshotRef.current.clear();
      hasPrimedSnapshotRef.current = false;
      return;
    }

    const previous = unlockedSnapshotRef.current;
    const next = new Set<string>();
    let shouldPrime = !hasPrimedSnapshotRef.current;

    for (const achievement of achievementStatus) {
      if (!achievement.unlocked) continue;

      next.add(achievement.id);

      if (previous.has(achievement.id)) {
        continue;
      }

      if (shouldPrime) {
        continue;
      }

      handleToast(achievement);
    }

    unlockedSnapshotRef.current = next;
    if (shouldPrime) {
      hasPrimedSnapshotRef.current = true;
    }
  }, [achievementStatus, userId, handleToast]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const unsubscribe = subscribeToImmediateAchievementAwards(({ userId: eventUserId, awards }) => {
      if (eventUserId !== userId || awards.length === 0) {
        return;
      }

      const receivedAt = Date.now();

      for (const award of awards) {
        const resolved = applyImmediateAwardToCache(award);

        if (resolved) {
          const toastDisplayedAt = Date.now();
          addMonitoringBreadcrumb({
            category: 'achievements',
            message: 'Achievement unlocked (inline)',
            data: {
              userId,
              achievementId: resolved.id,
              latencyMs: toastDisplayedAt - receivedAt,
            },
          });
          handleToast(resolved);
          continue;
        }

        showToast(`You just unlocked ${award.achievementKey}!`);
        addMonitoringBreadcrumb({
          category: 'achievements',
          message: 'Achievement unlocked (inline fallback)',
          data: {
            userId,
            achievementKey: award.achievementKey,
          },
          level: 'warning',
        });
      }
    });

    return unsubscribe;
  }, [applyImmediateAwardToCache, handleToast, showToast, userId]);

  useEffect(() => {
    const teardown = () => {
      if (!channelRef.current) {
        return;
      }

      const existingChannel = channelRef.current;
      channelRef.current = null;

      existingChannel
        .unsubscribe()
        .catch((unsubscribeError) => {
          captureHandledException(unsubscribeError, {
            scope: 'notifications.realtime',
            action: 'unsubscribe',
            userId: activeUserRef.current,
          });
        })
        .finally(() => {
          supabase.removeChannel(existingChannel);
          addMonitoringBreadcrumb({
            category: 'realtime',
            message: 'Notifications channel torn down',
            data: {
              userId: activeUserRef.current,
              route: routeRef.current,
            },
          });
        });
    };

    if (!userId) {
      teardown();
      activeUserRef.current = null;
      channelInstanceRef.current = null;
      hasPrimedChannelRef.current = false;
      return;
    }

    // Removed canSubscribe gate to prevent race condition:
    // The subscription needs to be active immediately when user logs in
    // so it can catch notifications that arrive while achievements are still loading.
    // The snapshot-based detection (lines 123-154) handles achievements
    // that were unlocked before the subscription became active.
    hasPrimedChannelRef.current = true;

    if (activeUserRef.current === userId && channelRef.current) {
      return;
    }

    teardown();
    processedNotificationIdsRef.current.clear();

    const instanceId = Math.random().toString(36).slice(2, 10);
    channelInstanceRef.current = instanceId;
    activeUserRef.current = userId;

    const channelName = `notifications:user:${userId}:${instanceId}`;
    const channel = supabase.channel(channelName);
    channelRef.current = channel;

    addMonitoringBreadcrumb({
      category: 'realtime',
      message: 'Notifications channel created',
      data: {
        userId,
        channelName,
        instanceId,
        route: routeRef.current,
        state: (channel as { state?: string }).state ?? 'unknown',
      },
    });

    const handleAchievementAwarded = (
      payload: Record<string, unknown> | null,
      createdAt: string | null,
    ) => {
      const notificationReceivedAt = Date.now();

      const achievementIdRaw =
        (payload?.achievement_id ?? payload?.achievementId) ?? null;
      const achievementId =
        typeof achievementIdRaw === 'string' ? achievementIdRaw : null;
      const awardedAtRaw =
        (payload?.awarded_at ?? payload?.awardedAt ?? createdAt) ?? null;
      const awardedAt =
        typeof awardedAtRaw === 'string' ? awardedAtRaw : createdAt ?? null;
      const contextRaw = payload?.context ?? null;
      const context: Json | null =
        typeof contextRaw === 'object' && contextRaw !== null ? (contextRaw as Json) : null;

      addMonitoringBreadcrumb({
        category: 'achievements',
        message: 'Achievement notification received',
        data: {
          userId,
          achievementId,
          notificationReceivedAt,
        },
      });

      let matchedAchievement: AchievementWithStatus | undefined;

      queryClient.setQueryData<AchievementWithStatus[] | undefined>(
        statusQueryKey,
        (current) => {
          if (!current || !achievementId) {
            return current;
          }

          return current.map((entry) => {
            if (entry.id !== achievementId) {
              return entry;
            }

            const updated: AchievementWithStatus = {
              ...entry,
              unlocked: true,
              unlockedAt: awardedAt,
              context: context ?? entry.context,
            };
            matchedAchievement = updated;
            return updated;
          });
        },
      );

      const unlockedAchievement = matchedAchievement;

      if (unlockedAchievement) {
        const toastDisplayedAt = Date.now();
        const latencyMs = toastDisplayedAt - notificationReceivedAt;

        addMonitoringBreadcrumb({
          category: 'achievements',
          message: 'Achievement unlocked (cache hit)',
          data: {
            userId,
            achievementId: unlockedAchievement.id,
            latencyMs,
          },
        });
        handleToast(unlockedAchievement);
        return;
      }

      void queryClient.invalidateQueries({ queryKey: statusQueryKey });

      void (async () => {
        try {
          const latest = await queryClient.fetchQuery({
            queryKey: statusQueryKey,
            queryFn: () => fetchAchievementStatus(userId),
          });

          const fetchedAchievement = latest.find((entry) =>
            achievementId ? entry.id === achievementId : entry.unlocked,
          );

          if (fetchedAchievement) {
            const toastDisplayedAt = Date.now();
            const latencyMs = toastDisplayedAt - notificationReceivedAt;

            addMonitoringBreadcrumb({
              category: 'achievements',
              message: 'Achievement unlocked (refetch)',
              data: {
                userId,
                achievementId: fetchedAchievement.id,
                latencyMs,
              },
            });
            handleToast(fetchedAchievement);
            return;
          }
        } catch (refetchError) {
          captureHandledException(refetchError, {
            scope: 'notifications.realtime',
            action: 'refetch',
            userId,
            type: 'achievement_awarded',
          });
        }

        const fallbackName =
          (typeof payload?.achievement_key === 'string' && payload?.achievement_key.trim().length > 0
            ? payload?.achievement_key
            : null) ??
          'achievement';

        const toastDisplayedAt = Date.now();
        const latencyMs = toastDisplayedAt - notificationReceivedAt;

        showToast(`You just unlocked ${fallbackName}!`);
        addMonitoringBreadcrumb({
          category: 'achievements',
          message: 'Achievement unlocked (fallback)',
          data: {
            userId,
            achievementId,
            latencyMs,
          },
          level: 'warning',
        });
        return;
      })();
    };

    const updateDailyTasksSummary = (
      conventionId: string | null,
      updater: (summary: DailyTasksSummary) => DailyTasksSummary | null,
    ) => {
      if (!userId || !conventionId) {
        return;
      }

      queryClient.setQueryData<DailyTasksSummary | undefined>(
        dailyTasksQueryKey(userId, conventionId),
        (current) => {
          if (!current) {
            return current;
          }
          const next = updater(current);
          return next ?? current;
        },
      );
    };

    const handleDailyReset = (payload: Record<string, unknown> | null) => {
      const conventionNameRaw = payload?.convention_name ?? payload?.conventionName ?? null;
      const conventionName =
        typeof conventionNameRaw === 'string' && conventionNameRaw.trim().length > 0
          ? conventionNameRaw.trim()
          : null;

      const message = conventionName
        ? `Daily tasks refreshed for ${conventionName}!`
        : 'New daily tasks are available!';

      showToast(message);
      addMonitoringBreadcrumb({
        category: 'daily-tasks',
        message: 'Daily reset notification received',
        data: {
          userId,
          conventionName,
        },
      });
      const conventionId = typeof payload?.convention_id === 'string' ? payload.convention_id : null;
      if (userId && conventionId) {
        queryClient.removeQueries({ queryKey: dailyTasksQueryKey(userId, conventionId) });
      } else {
        void queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
      }
    };

    const handleDailyTaskCompleted = (payload: Record<string, unknown> | null) => {
      const taskNameRaw = payload?.task_name ?? payload?.taskName ?? null;
      const taskName =
        typeof taskNameRaw === 'string' && taskNameRaw.trim().length > 0
          ? taskNameRaw.trim()
          : null;
      const taskIdRaw = payload?.task_id ?? payload?.taskId ?? null;
      const taskId = typeof taskIdRaw === 'string' ? taskIdRaw : null;
      const conventionId = typeof payload?.convention_id === 'string' ? payload.convention_id : null;
      const completionTimestamp = typeof payload?.completed_at === 'string'
        ? payload?.completed_at as string
        : new Date().toISOString();
      const day = typeof payload?.day === 'string' ? payload.day : null;
      const incrementRaw = payload?.increment ?? null;
      const incrementCount = typeof incrementRaw === 'number' && Number.isFinite(incrementRaw)
        ? incrementRaw
        : 1;

      const message = taskName ? `Daily task complete: ${taskName}` : 'Daily task complete!';
      showToast(message);
      addMonitoringBreadcrumb({
        category: 'daily-tasks',
        message: 'Daily task completion notification received',
        data: {
          userId,
          taskName,
          taskId: payload?.task_id ?? payload?.taskId ?? null,
        },
      });
      updateDailyTasksSummary(conventionId, (summary) => {
        if (!taskId || (day && summary.day !== day)) {
          return summary;
        }

        let changed = false;
        const tasks = summary.tasks.map((task) => {
          if (task.id !== taskId) {
            return task;
          }

          const baseCount = Math.max(task.currentCount ?? 0, 0);
          const candidateCount = Math.min(
            baseCount + incrementCount,
            task.requirement,
          );
          const becameComplete = candidateCount >= task.requirement;

          if (!becameComplete && candidateCount === baseCount) {
            return task;
          }

          changed = true;
          return {
            ...task,
            currentCount: candidateCount,
            isCompleted: becameComplete,
            completedAt: becameComplete
              ? task.completedAt ?? completionTimestamp ?? new Date().toISOString()
              : task.completedAt,
          };
        });

        if (!changed) {
          return summary;
        }

        const completedCount = tasks.filter((task) => task.isCompleted).length;
        const remainingCount = Math.max(summary.totalCount - completedCount, 0);
        return {
          ...summary,
          tasks,
          completedCount,
          remainingCount,
        };
      });
    };

    const handleDailyAllComplete = (payload: Record<string, unknown> | null) => {
      const currentStreakRaw = payload?.current_streak ?? payload?.currentStreak ?? null;
      const currentStreak =
        typeof currentStreakRaw === 'number' && Number.isFinite(currentStreakRaw)
          ? currentStreakRaw
          : null;

      const message =
        currentStreak && currentStreak > 1
          ? `All daily tasks complete! Streak: ${currentStreak}`
          : 'All daily tasks complete!';

      showToast(message);
      addMonitoringBreadcrumb({
        category: 'daily-tasks',
        message: 'All daily tasks complete notification received',
        data: {
          userId,
          currentStreak,
        },
      });
      const conventionId = typeof payload?.convention_id === 'string' ? payload.convention_id : null;
      const day = typeof payload?.day === 'string' ? payload.day : null;
      updateDailyTasksSummary(conventionId, (summary) => {
        if (day && summary.day !== day) {
          return summary;
        }

        const tasks = summary.tasks.map((task) => {
          if (task.isCompleted) {
            return task;
          }

          return {
            ...task,
            currentCount: task.requirement,
            isCompleted: true,
            completedAt: task.completedAt ?? new Date().toISOString(),
          };
        });

        const completedCount = tasks.length;
        const remainingCount = 0;
        return {
          ...summary,
          tasks,
          completedCount,
          remainingCount,
          streak: {
            current: currentStreak ?? summary.streak.current,
            best: Math.max(currentStreak ?? summary.streak.current, summary.streak.best),
            lastCompletedDay: summary.day,
          },
        };
      });
    };

    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const newRow = payload.new as Record<string, unknown> | null;
        if (!newRow || typeof newRow !== 'object') {
          return;
        }

        const idRaw = (newRow as { id?: unknown }).id ?? null;
        const notificationId = typeof idRaw === 'string' ? idRaw : null;

        if (notificationId) {
          const processedIds = processedNotificationIdsRef.current;
          if (processedIds.has(notificationId)) {
            return;
          }
          processedIds.add(notificationId);
          if (processedIds.size > 200) {
            const iterator = processedIds.values().next();
            if (!iterator.done && iterator.value) {
              processedIds.delete(iterator.value);
            }
          }
        }

        const typeRaw = (newRow as { type?: unknown }).type ?? null;
        const type = typeof typeRaw === 'string' ? typeRaw : null;
        if (!type) {
          return;
        }

        const createdAtRaw = (newRow as { created_at?: unknown }).created_at ?? null;
        const createdAt = typeof createdAtRaw === 'string' ? createdAtRaw : null;
        const payloadRaw = (newRow as { payload?: unknown }).payload ?? null;
        const notificationPayload =
          typeof payloadRaw === 'object' && payloadRaw !== null
            ? (payloadRaw as Record<string, unknown>)
            : null;

        switch (type) {
          case 'achievement_awarded':
            handleAchievementAwarded(notificationPayload, createdAt);
            break;
          case 'daily_reset':
            handleDailyReset(notificationPayload);
            break;
          case 'daily_task_completed':
            handleDailyTaskCompleted(notificationPayload);
            break;
          case 'daily_all_complete':
            handleDailyAllComplete(notificationPayload);
            break;
          default:
            break;
        }
      },
    );

    const resubscribe = () => {
      setTimeout(() => {
        if (channelRef.current !== channel) {
          return;
        }

        try {
          channel.subscribe(handleChannelStatus);
          addMonitoringBreadcrumb({
            category: 'realtime',
            message: 'Notifications channel resubscribe attempt',
            data: {
              userId,
              channelName,
              route: routeRef.current,
            },
          });
        } catch (subscribeError) {
          captureHandledException(subscribeError, {
            scope: 'notifications.realtime',
            action: 'resubscribe',
            userId,
            channelName,
          });
        }
      }, 1_000);
    };

    const handleChannelStatus = (status: string, error?: Error) => {
      if (status === 'SUBSCRIBED') {
        addMonitoringBreadcrumb({
          category: 'realtime',
          message: 'Notifications channel subscribed',
          data: {
            userId,
            channelName,
            instanceId,
            route: routeRef.current,
          },
        });
      } else if (status === 'CHANNEL_ERROR' && error) {
        captureHandledException(error, {
          scope: 'notifications.realtime',
          action: 'subscribe',
          userId,
          channelName,
        });
        resubscribe();
      } else if (status === 'TIMED_OUT') {
        addMonitoringBreadcrumb({
          category: 'realtime',
          message: 'Notifications channel subscription timed out',
          data: {
            userId,
            channelName,
            route: routeRef.current,
          },
          level: 'warning',
        });
        resubscribe();
      } else if (status === 'CLOSED') {
        addMonitoringBreadcrumb({
          category: 'realtime',
          message: 'Notifications channel closed',
          data: {
            userId,
            channelName,
            route: routeRef.current,
          },
        });
        resubscribe();
      }
    };

    channel.subscribe(handleChannelStatus);

    return () => {
      teardown();
      activeUserRef.current = null;
      channelInstanceRef.current = null;
    };
    // Note: hasLoadedAchievements is intentionally NOT in the dependency array
    // The subscription needs to be active immediately when user logs in
    // so it can catch notifications that arrive during onboarding/navigation
  }, [userId, queryClient, statusQueryKey, handleToast, showToast]);

  return null;
}
