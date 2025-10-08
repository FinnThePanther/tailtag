import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';

import { supabase } from '../../lib/supabase';
import type { UserAchievementsRow } from '../../types/database';
import {
  achievementsStatusQueryKey,
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

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`achievements:user:${userId}`)
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
