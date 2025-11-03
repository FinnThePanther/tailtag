import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../auth';
import { useAchievementUnlockToast, useAchievementsRealtime } from '..';
import { achievementsStatusQueryKey, fetchAchievementStatus } from '../api/achievements';
import { supabase } from '../../../lib/supabase';
import { addMonitoringBreadcrumb, captureHandledException } from '../../../lib/sentry';
import { useToast } from '../../../hooks/useToast';
import { DAILY_TASKS_QUERY_KEY } from '../../daily-tasks/hooks';
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

  const statusQueryKey = useMemo(
    () => (userId ? achievementsStatusQueryKey(userId) : ['achievements-status', 'guest'] as const),
    [userId],
  );

  const { data: achievementStatus } = useQuery({
    queryKey: statusQueryKey,
    queryFn: () => fetchAchievementStatus(userId ?? ''),
    enabled: Boolean(userId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useAchievementsRealtime(userId, { onUnlocked: handleToast });

  const unlockedSnapshotRef = useRef<Set<string>>(new Set());
  const hasPrimedSnapshotRef = useRef<boolean>(false);

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
        });
    };

    if (!userId) {
      teardown();
      activeUserRef.current = null;
      channelInstanceRef.current = null;
      return;
    }

    if (activeUserRef.current === userId && channelRef.current) {
      return;
    }

    teardown();

    const instanceId = Math.random().toString(36).slice(2, 10);
    channelInstanceRef.current = instanceId;
    activeUserRef.current = userId;

    const channelName = `notifications:user:${userId}:${instanceId}`;
    const channel = supabase.channel(channelName);
    channelRef.current = channel;

    const handleAchievementAwarded = (
      payload: Record<string, unknown> | null,
      createdAt: string | null,
    ) => {
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
        addMonitoringBreadcrumb({
          category: 'achievements',
          message: 'Achievement unlocked (notification)',
          data: {
            userId,
            achievementId: unlockedAchievement.id,
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
            addMonitoringBreadcrumb({
              category: 'achievements',
              message: 'Achievement unlocked (notification-refetch)',
              data: {
                userId,
                achievementId: fetchedAchievement.id,
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

        showToast(`You just unlocked ${fallbackName}!`);
        addMonitoringBreadcrumb({
          category: 'achievements',
          message: 'Achievement unlocked (notification-fallback)',
          data: {
            userId,
            achievementId,
          },
          level: 'warning',
        });
        return;
      })();
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
      void queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
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
          default:
            break;
        }
      },
    );

    channel.subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' && error) {
        captureHandledException(error, {
          scope: 'notifications.realtime',
          action: 'subscribe',
          userId,
        });
      }
    });

    return () => {
      teardown();
      activeUserRef.current = null;
      channelInstanceRef.current = null;
    };
  }, [userId, queryClient, statusQueryKey, handleToast, showToast]);

  return null;
}
