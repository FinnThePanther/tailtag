import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';

import { supabase } from '../../lib/supabase';
import type { UserAchievementsRow } from '../../types/database';
import {
  achievementsStatusQueryKey,
  fetchAchievementStatus,
  type AchievementWithStatus,
} from './api/achievements';
import { useToast } from '../../hooks/useToast';
import {
  addMonitoringBreadcrumb,
  captureHandledException,
} from '../../lib/sentry';

export type AchievementRealtimeOptions = {
  onUnlocked?: (achievement: AchievementWithStatus) => void;
};

export function useAchievementsRealtime(
  userId: string | null,
  options?: AchievementRealtimeOptions
) {
  const queryClient = useQueryClient();
  const onUnlocked = options?.onUnlocked;
  const channelInstanceRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      channelInstanceRef.current = null;
      return;
    }

    if (!channelInstanceRef.current) {
      channelInstanceRef.current = Math.random().toString(36).slice(2, 10);
    }

    const channelName = `achievements:user:${userId}:${channelInstanceRef.current}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_achievements',
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresInsertPayload<UserAchievementsRow>) => {
          const newRow = payload.new as UserAchievementsRow;
          let matchedAchievement: AchievementWithStatus | null = null;

          queryClient.setQueryData<AchievementWithStatus[] | undefined>(
            achievementsStatusQueryKey(userId),
            (current) => {
              if (!current) {
                return current;
              }

              return current.map((entry) => {
                if (entry.id !== newRow.achievement_id) {
                  return entry;
                }

                const updated: AchievementWithStatus = {
                  ...entry,
                  unlocked: true,
                  unlockedAt: newRow.unlocked_at,
                  context: newRow.context ?? null,
                };
                matchedAchievement = updated;
                return updated;
              });
            }
          );

          const unlockedAchievement = matchedAchievement as AchievementWithStatus | null;
          if (unlockedAchievement !== null) {
            addMonitoringBreadcrumb({
              category: 'achievements',
              message: 'Achievement unlocked (realtime)',
              data: {
                userId,
                achievementId: unlockedAchievement.id,
              },
            });
            onUnlocked?.(unlockedAchievement);
            return;
          }

          void queryClient.invalidateQueries({ queryKey: achievementsStatusQueryKey(userId) });

          void (async () => {
            try {
              const latest = await queryClient.fetchQuery({
                queryKey: achievementsStatusQueryKey(userId),
                queryFn: () => fetchAchievementStatus(userId),
              });

              const fetchedAchievement = latest.find(
                (entry) => entry.id === newRow.achievement_id,
              );

              if (fetchedAchievement) {
                addMonitoringBreadcrumb({
                  category: 'achievements',
                  message: 'Achievement unlocked (realtime-refetch)',
                  data: {
                    userId,
                    achievementId: fetchedAchievement.id,
                  },
                });
                onUnlocked?.(fetchedAchievement);
              }
            } catch (refetchError) {
              captureHandledException(refetchError, {
                scope: 'achievements.realtime',
                action: 'refetch',
                userId,
                achievementId: newRow.achievement_id,
              });
            }
          })();
        }
      );

    channel.subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' && error) {
        captureHandledException(error, {
          scope: 'achievements.realtime',
          action: 'subscribe',
          userId,
        });
      }
    });

    return () => {
      channel
        .unsubscribe()
        .catch((unsubscribeError) => {
          captureHandledException(unsubscribeError, {
            scope: 'achievements.realtime',
            action: 'unsubscribe',
            userId,
          });
        })
        .finally(() => {
          supabase.removeChannel(channel);
          if (channelInstanceRef.current) {
            channelInstanceRef.current = null;
          }
        });
    };
  }, [userId, queryClient, onUnlocked]);
}

export function useAchievementUnlockToast(userId: string | null) {
  const { showToast } = useToast();
  const seenUnlocksRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) {
      seenUnlocksRef.current.clear();
    }
  }, [userId]);

  return useCallback(
    (achievement: AchievementWithStatus) => {
      if (!userId) {
        return;
      }

      const key = `${achievement.id}:${achievement.unlockedAt ?? 'pending'}`;
      if (seenUnlocksRef.current.has(key)) {
        return;
      }
      seenUnlocksRef.current.add(key);

      showToast(`You just unlocked ${achievement.name}!`);
    },
    [showToast, userId],
  );
}
