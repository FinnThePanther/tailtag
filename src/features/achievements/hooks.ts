import { useCallback, useEffect, useRef } from 'react';

import type { AchievementWithStatus } from './api/achievements';
import { useToast } from '../../hooks/useToast';

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
