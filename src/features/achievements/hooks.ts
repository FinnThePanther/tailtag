import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';

import { supabase } from '../../lib/supabase';
import type { UserAchievementsRow } from '../../types/database';
import {
  achievementsStatusQueryKey,
  type AchievementWithStatus,
} from './api/achievements';

export type AchievementRealtimeOptions = {
  onUnlocked?: (achievement: AchievementWithStatus) => void;
};

export function useAchievementsRealtime(
  userId: string | null,
  options?: AchievementRealtimeOptions
) {
  const queryClient = useQueryClient();

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

          if (matchedAchievement) {
            options?.onUnlocked?.(matchedAchievement);
            return;
          }

          void queryClient.invalidateQueries({ queryKey: achievementsStatusQueryKey(userId) });
        }
      );

    channel.subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' && error) {
        console.error('Achievements channel error', error);
      }
    });

    return () => {
      channel
        .unsubscribe()
        .catch((unsubscribeError) => {
          console.error('Failed to unsubscribe from achievements channel', unsubscribeError);
        })
        .finally(() => {
          supabase.removeChannel(channel);
        });
    };
  }, [userId, queryClient, options]);
}
