import { useEffect } from 'react';

import { useToast } from '../../../hooks/useToast';
import { useInterval } from '../../../hooks/useInterval';
import { usePrevious } from '../../../hooks/usePrevious';
import { useAchievementNotifications } from './useAchievementNotifications';

const POLL_INTERVAL_MS = 30_000;

export function useAchievementNotificationsToast(userId: string | null) {
  const { showToast } = useToast();
  const { notifications, refetch } = useAchievementNotifications(userId);
  const previousCount = usePrevious(notifications.length);

  useEffect(() => {
    if (!userId) return;
    const previous = previousCount ?? 0;
    const current = notifications.length;
    if (current > previous) {
      const diff = current - previous;
      showToast(
        `You just unlocked ${diff} new ${diff === 1 ? 'achievement' : 'achievements'}!`,
      );
    }
  }, [notifications.length, previousCount, showToast, userId]);

  useEffect(() => {
    if (!userId) return;

    const timeoutId = setTimeout(() => {
      void refetch();
    }, 1_000);

    const secondTimeoutId = setTimeout(() => {
      void refetch();
    }, 3_000);

    const thirdTimeoutId = setTimeout(() => {
      void refetch();
    }, 6_000);

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(secondTimeoutId);
      clearTimeout(thirdTimeoutId);
    };
  }, [userId, refetch]);

  useInterval(() => {
    if (!userId) return;
    void refetch();
  }, POLL_INTERVAL_MS, Boolean(userId));
}
