import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSegments } from 'expo-router';

import { useAuth } from '../../auth';
import { useAchievementUnlockToast } from '../hooks';
import { achievementsStatusQueryKey, fetchAchievementStatus } from '../api/achievements';
import {
  subscribeToImmediateAchievementAwards,
  type ImmediateAchievementAward,
} from '../immediateAwardsBus';
import { supabase } from '../../../lib/supabase';
import { addMonitoringBreadcrumb, captureHandledException } from '../../../lib/sentry';
import { useToast } from '../../../hooks/useToast';
import { subscribeToLocalGameplayEvents, type LocalGameplayEvent } from '../../events/localGameplayEventsBus';
import { DAILY_TASKS_QUERY_KEY, dailyTasksQueryKey } from '../../daily-tasks';
import type { DailyTasksSummary } from '../../daily-tasks';
import type { AchievementWithStatus } from '../api/achievements';
import { caughtSuitsQueryKey, type CaughtRecord } from '../../suits';
import {
  hasUploadedProfileAvatar,
  profileQueryKey,
  type ProfileSummary,
} from '../../profile';
import type { Json } from '../../../types/database';

const CATCH_RECONCILE_WINDOW_MS = 45_000;
const CATCH_RECONCILE_POLL_INTERVAL_MS = 2_000;

type NotificationRow = {
  id: string;
  created_at: string;
  type: string;
  payload: Json;
  user_id: string;
};

type DailyTaskMetadataFilter = {
  path: string;
  equals?: unknown;
  notEquals?: unknown;
  in?: unknown[];
  notIn?: unknown[];
  exists?: boolean;
  notEqualsUserId?: boolean;
};

type DailyTaskMetadata = {
  eventType: string;
  metric: 'total' | 'unique';
  uniqueBy?: string;
  includeTutorialCatches: boolean;
  filters: DailyTaskMetadataFilter[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getValueAtPath(root: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }
    return current[segment];
  }, root);
}

function normalizeDailyTaskMetadata(raw: unknown): DailyTaskMetadata | null {
  if (!isRecord(raw)) {
    return null;
  }

  const eventType = typeof raw.eventType === 'string'
    ? raw.eventType
    : typeof raw.event_type === 'string'
      ? raw.event_type
      : typeof raw.trigger === 'string'
        ? raw.trigger
        : null;

  if (!eventType) {
    return null;
  }

  return {
    eventType,
    metric: raw.metric === 'unique' ? 'unique' : 'total',
    uniqueBy: typeof raw.uniqueBy === 'string'
      ? raw.uniqueBy
      : typeof raw.unique_by === 'string'
        ? raw.unique_by
        : undefined,
    includeTutorialCatches: raw.includeTutorialCatches === true || raw.include_tutorial_catches === true,
    filters: Array.isArray(raw.filters)
      ? raw.filters.filter((entry): entry is DailyTaskMetadataFilter => isRecord(entry) && typeof entry.path === 'string')
      : [],
  };
}

function matchesLocalDailyTaskFilters(
  metadata: DailyTaskMetadata,
  eventPayload: Record<string, unknown>,
  userId: string,
) {
  return metadata.filters.every((filter) => {
    const candidate = getValueAtPath(eventPayload, filter.path);

    if (filter.exists === true && candidate === undefined) {
      return false;
    }

    if (filter.exists === false && candidate !== undefined) {
      return false;
    }

    if (filter.notEqualsUserId === true && candidate === userId) {
      return false;
    }

    if (Object.prototype.hasOwnProperty.call(filter, 'equals') && candidate !== filter.equals) {
      return false;
    }

    if (Object.prototype.hasOwnProperty.call(filter, 'notEquals') && candidate === filter.notEquals) {
      return false;
    }

    if (Array.isArray(filter.in) && !filter.in.includes(candidate)) {
      return false;
    }

    if (Array.isArray(filter.notIn) && filter.notIn.includes(candidate)) {
      return false;
    }

    return true;
  });
}

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
  const optimisticEventKeysRef = useRef<Set<string>>(new Set());
  const surfacedDailyTaskKeysRef = useRef<Set<string>>(new Set());
  const surfacedDailyAllCompleteKeysRef = useRef<Set<string>>(new Set());
  const sessionStartedAtRef = useRef<string>(new Date().toISOString());
  const notificationCatchupCursorRef = useRef<string>(sessionStartedAtRef.current);
  const catchReconcileTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catchReconcileUntilRef = useRef<number>(0);
  const catchReconcileInFlightRef = useRef<boolean>(false);

  const segments = useSegments();

  useEffect(() => {
    routeRef.current = segments.join('/') || 'root';
  }, [segments]);

  const statusQueryKey = useMemo(
    () => (userId ? achievementsStatusQueryKey(userId) : ['achievements-status', 'guest'] as const),
    [userId],
  );

  const clearCatchReconcileTimer = useCallback(() => {
    if (catchReconcileTimeoutRef.current) {
      clearTimeout(catchReconcileTimeoutRef.current);
      catchReconcileTimeoutRef.current = null;
    }
  }, []);

  const scheduleCatchReconcile = useCallback(() => {
    if (!userId) {
      return;
    }

    catchReconcileUntilRef.current = Math.max(
      catchReconcileUntilRef.current,
      Date.now() + CATCH_RECONCILE_WINDOW_MS,
    );

    if (catchReconcileTimeoutRef.current) {
      return;
    }

    const tick = async () => {
      if (!userId) {
        clearCatchReconcileTimer();
        catchReconcileUntilRef.current = 0;
        catchReconcileInFlightRef.current = false;
        return;
      }

      if (Date.now() > catchReconcileUntilRef.current) {
        clearCatchReconcileTimer();
        catchReconcileUntilRef.current = 0;
        catchReconcileInFlightRef.current = false;
        return;
      }

      if (!catchReconcileInFlightRef.current) {
        catchReconcileInFlightRef.current = true;
        try {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: statusQueryKey }),
            queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] }),
          ]);
        } finally {
          catchReconcileInFlightRef.current = false;
        }
      }

      catchReconcileTimeoutRef.current = setTimeout(() => {
        void tick();
      }, CATCH_RECONCILE_POLL_INTERVAL_MS);
    };

    catchReconcileTimeoutRef.current = setTimeout(() => {
      void tick();
    }, 0);
  }, [clearCatchReconcileTimer, queryClient, statusQueryKey, userId]);

  useEffect(() => {
    return () => {
      clearCatchReconcileTimer();
      catchReconcileUntilRef.current = 0;
      catchReconcileInFlightRef.current = false;
    };
  }, [clearCatchReconcileTimer]);

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
  const snapshotUserRef = useRef<string | null>(null);

  const markAchievementAsSurfaced = useCallback((achievementId: string | null) => {
    if (!achievementId) {
      return;
    }
    unlockedSnapshotRef.current.add(achievementId);
  }, []);

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
    if (snapshotUserRef.current !== userId) {
      clearCatchReconcileTimer();
      catchReconcileUntilRef.current = 0;
      catchReconcileInFlightRef.current = false;
      unlockedSnapshotRef.current.clear();
      hasPrimedSnapshotRef.current = false;
      snapshotUserRef.current = userId;
      optimisticEventKeysRef.current.clear();
      surfacedDailyTaskKeysRef.current.clear();
      surfacedDailyAllCompleteKeysRef.current.clear();
      sessionStartedAtRef.current = new Date().toISOString();
      notificationCatchupCursorRef.current = sessionStartedAtRef.current;
    }

    if (!userId) {
      return;
    }

    if (!achievementStatus) {
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
  }, [achievementStatus, clearCatchReconcileTimer, userId, handleToast]);

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
        markAchievementAsSurfaced(award.achievementId);
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
  }, [applyImmediateAwardToCache, handleToast, markAchievementAsSurfaced, showToast, userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const unsubscribe = subscribeToLocalGameplayEvents((event: LocalGameplayEvent) => {
      const status = queryClient.getQueryData<AchievementWithStatus[] | undefined>(statusQueryKey);
      const profile = queryClient.getQueryData<ProfileSummary | null | undefined>(profileQueryKey(userId));
      const eventPayload = isRecord(event.payload) ? event.payload : {};
      const nestedEventPayload = isRecord(eventPayload.payload)
        ? (eventPayload.payload as Record<string, unknown>)
        : null;
      const normalizedEventPayload = nestedEventPayload ?? eventPayload;

      const predictedAchievementKeys: string[] = [];

      if (event.type === 'onboarding_completed') {
        predictedAchievementKeys.push('getting_started');
      } else if (event.type === 'convention_joined' && event.conventionId) {
        predictedAchievementKeys.push('EXPLORER');
      } else if (
        event.type === 'profile_updated' &&
        profile &&
        hasUploadedProfileAvatar(profile.avatar_url) &&
        typeof profile.username === 'string' &&
        profile.username.trim().length > 0 &&
        typeof profile.bio === 'string' &&
        profile.bio.trim().length > 0
      ) {
        predictedAchievementKeys.push('PROFILE_COMPLETE');
      } else if (event.type === 'catch_performed') {
        const tutorialValue = normalizedEventPayload.is_tutorial;
        const isTutorialCatch = tutorialValue === true || tutorialValue === 'true';

        if (!isTutorialCatch) {
          const caughtSuits = queryClient.getQueryData<CaughtRecord[] | undefined>(
            caughtSuitsQueryKey(userId),
          );
          const estimatedTotalCatches = Array.isArray(caughtSuits) ? caughtSuits.length + 1 : null;

          if (estimatedTotalCatches === 1) {
            predictedAchievementKeys.push('FIRST_CATCH');
          }
          if (estimatedTotalCatches === 10) {
            predictedAchievementKeys.push('GETTING_THE_HANG_OF_IT');
          }
          if (estimatedTotalCatches === 25) {
            predictedAchievementKeys.push('SUPER_CATCHER');
          }
        }

        scheduleCatchReconcile();
      }

      for (const achievementKey of predictedAchievementKeys) {
        const matchingAchievement = status?.find((entry) => entry.key === achievementKey && !entry.unlocked);
        if (!matchingAchievement) {
          continue;
        }

        const optimisticKey = `${event.idempotencyKey}:achievement:${matchingAchievement.id}`;
        if (optimisticEventKeysRef.current.has(optimisticKey)) {
          continue;
        }
        optimisticEventKeysRef.current.add(optimisticKey);

        const optimisticAchievement: AchievementWithStatus = {
          ...matchingAchievement,
          unlocked: true,
          unlockedAt: event.occurredAt,
          context: matchingAchievement.context,
        };

        markAchievementAsSurfaced(matchingAchievement.id);
        queryClient.setQueryData<AchievementWithStatus[] | undefined>(
          statusQueryKey,
          (current) => current?.map((entry) => (
            entry.id === matchingAchievement.id ? optimisticAchievement : entry
          )) ?? current,
        );
        handleToast(optimisticAchievement);

        addMonitoringBreadcrumb({
          category: 'achievements',
          message: 'Achievement unlocked (optimistic)',
          data: {
            userId,
            eventId: event.eventId,
            achievementId: matchingAchievement.id,
            latencyMs: Date.now() - event.emittedAt,
          },
        });
      }

      if (!event.conventionId) {
        return;
      }

      const summaryKey = dailyTasksQueryKey(userId, event.conventionId);
      const currentSummary = queryClient.getQueryData<DailyTasksSummary | undefined>(summaryKey);
      if (!currentSummary) {
        return;
      }

      let allCompleteAlready = currentSummary.tasks.length > 0 &&
        currentSummary.tasks.every((task) => task.isCompleted);
      const completedTaskToasts: string[] = [];
      let shouldToastAllComplete = false;

      queryClient.setQueryData<DailyTasksSummary | undefined>(summaryKey, (summary) => {
        if (!summary) {
          return summary;
        }

        let changed = false;
        let completedCount = 0;
        const tasks = summary.tasks.map((task) => {
          const metadata = normalizeDailyTaskMetadata(task.metadata);
          if (!metadata || metadata.eventType !== event.type || metadata.metric !== 'total') {
            if (task.isCompleted) {
              completedCount += 1;
            }
            return task;
          }

          if (!matchesLocalDailyTaskFilters(metadata, normalizedEventPayload, userId)) {
            if (task.isCompleted) {
              completedCount += 1;
            }
            return task;
          }

          const nextCount = Math.min(Math.max(task.currentCount, 0) + 1, task.requirement);
          const nextIsCompleted = nextCount >= task.requirement;
          const completionKey = `${summary.conventionId}:${summary.day}:${task.id}`;
          const shouldToastTask = !task.isCompleted && nextIsCompleted &&
            !surfacedDailyTaskKeysRef.current.has(completionKey);

          if (nextCount !== task.currentCount || nextIsCompleted !== task.isCompleted) {
            changed = true;
          }

          if (nextIsCompleted) {
            completedCount += 1;
          }

          if (shouldToastTask) {
            surfacedDailyTaskKeysRef.current.add(completionKey);
            completedTaskToasts.push(task.name);
          }

          return {
            ...task,
            currentCount: nextCount,
            isCompleted: nextIsCompleted,
            completedAt: nextIsCompleted ? task.completedAt ?? event.occurredAt : task.completedAt,
          };
        });

        const nowAllComplete = tasks.length > 0 && tasks.every((task) => task.isCompleted);
        const allCompleteKey = `${summary.conventionId}:${summary.day}`;
        if (
          nowAllComplete &&
          !allCompleteAlready &&
          !surfacedDailyAllCompleteKeysRef.current.has(allCompleteKey)
        ) {
          surfacedDailyAllCompleteKeysRef.current.add(allCompleteKey);
          shouldToastAllComplete = true;
        }

        if (!changed) {
          return summary;
        }

        return {
          ...summary,
          tasks,
          completedCount,
          remainingCount: Math.max(summary.totalCount - completedCount, 0),
        };
      });

      for (const taskName of completedTaskToasts) {
        showToast(`Daily task complete: ${taskName}`);
        addMonitoringBreadcrumb({
          category: 'daily-tasks',
          message: 'Daily task completion toast shown (optimistic)',
          data: {
            userId,
            eventId: event.eventId,
            conventionId: event.conventionId,
            taskName,
            latencyMs: Date.now() - event.emittedAt,
          },
        });
      }

      if (shouldToastAllComplete) {
        showToast('All daily tasks complete!');
        addMonitoringBreadcrumb({
          category: 'daily-tasks',
          message: 'All daily tasks complete toast shown (optimistic)',
          data: {
            userId,
            eventId: event.eventId,
            conventionId: event.conventionId,
            latencyMs: Date.now() - event.emittedAt,
          },
        });
      }
    });

    return unsubscribe;
  }, [
    handleToast,
    markAchievementAsSurfaced,
    queryClient,
    scheduleCatchReconcile,
    showToast,
    statusQueryKey,
    userId,
  ]);

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
      sessionStartedAtRef.current = new Date().toISOString();
      notificationCatchupCursorRef.current = sessionStartedAtRef.current;
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

      markAchievementAsSurfaced(achievementId);

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

    const catchUpAchievementNotifications = async () => {
      const catchupStartedAt = new Date().toISOString();
      const since = notificationCatchupCursorRef.current;

      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('id, created_at, type, payload, user_id')
          .eq('user_id', userId)
          .eq('type', 'achievement_awarded')
          .gte('created_at', since)
          .order('created_at', { ascending: true })
          .limit(20);

        if (error) {
          throw error;
        }

        const rows = (data ?? []) as NotificationRow[];
        for (const row of rows) {
          if (!row?.id) {
            continue;
          }

          const processedIds = processedNotificationIdsRef.current;
          if (processedIds.has(row.id)) {
            continue;
          }

          processedIds.add(row.id);
          if (processedIds.size > 200) {
            const iterator = processedIds.values().next();
            if (!iterator.done && iterator.value) {
              processedIds.delete(iterator.value);
            }
          }

          const notificationPayload =
            typeof row.payload === 'object' && row.payload !== null
              ? (row.payload as Record<string, unknown>)
              : null;

          handleAchievementAwarded(notificationPayload, row.created_at);
        }

        notificationCatchupCursorRef.current = catchupStartedAt;
      } catch (catchupError) {
        captureHandledException(catchupError, {
          scope: 'notifications.realtime',
          action: 'catchup',
          userId,
          type: 'achievement_awarded',
        });
      }
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
      const completionKey =
        conventionId && day && taskId ? `${conventionId}:${day}:${taskId}` : null;

      if (!completionKey || !surfacedDailyTaskKeysRef.current.has(completionKey)) {
        if (completionKey) {
          surfacedDailyTaskKeysRef.current.add(completionKey);
        }

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
      }

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
          if (task.isCompleted && baseCount >= task.requirement) {
            return task;
          }
          const candidateCount = Math.min(
            baseCount + incrementCount,
            task.requirement,
          );
          const becameComplete = candidateCount >= task.requirement;

          if (candidateCount === baseCount && task.completedAt === completionTimestamp) {
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
      const conventionId = typeof payload?.convention_id === 'string' ? payload.convention_id : null;
      const day = typeof payload?.day === 'string' ? payload.day : null;
      const allCompleteKey = conventionId && day ? `${conventionId}:${day}` : null;

      if (!allCompleteKey || !surfacedDailyAllCompleteKeysRef.current.has(allCompleteKey)) {
        if (allCompleteKey) {
          surfacedDailyAllCompleteKeysRef.current.add(allCompleteKey);
        }

        showToast(message);
        addMonitoringBreadcrumb({
          category: 'daily-tasks',
          message: 'All daily tasks complete notification received',
          data: {
            userId,
            currentStreak,
          },
        });
      }

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
        void catchUpAchievementNotifications();
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
  }, [userId, queryClient, statusQueryKey, handleToast, showToast, markAchievementAsSurfaced]);

  return null;
}
