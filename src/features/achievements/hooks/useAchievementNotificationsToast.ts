import { useEffect } from 'react';

import { useToast } from '../../../hooks/useToast';
import { useInterval } from '../../../hooks/useInterval';
import { useAchievementNotifications } from './useAchievementNotifications';

const POLL_INTERVAL_MS = 30_000;

const displayedNotificationIds = new Map<string, Set<string>>();

function getSeenSet(userId: string) {
  let set = displayedNotificationIds.get(userId);
  if (!set) {
    set = new Set<string>();
    displayedNotificationIds.set(userId, set);
  }
  return set;
}

export function useAchievementNotificationsToast(userId: string | null) {
  const { showToast } = useToast();
  const { notifications, refetch } = useAchievementNotifications(userId);

  useEffect(() => {
    if (!userId) {
      displayedNotificationIds.clear();
      return;
    }

    const seenSet = getSeenSet(userId);
    const unseen = notifications.filter((notification) => !seenSet.has(notification.id));

    if (unseen.length > 0) {
      const diff = unseen.length;
      showToast(`You just unlocked ${diff} new ${diff === 1 ? 'achievement' : 'achievements'}!`);
      unseen.forEach((notification) => seenSet.add(notification.id));
    }

    const currentIds = new Set(notifications.map((notification) => notification.id));
    for (const id of Array.from(seenSet)) {
      if (!currentIds.has(id)) {
        seenSet.delete(id);
      }
    }
  }, [notifications, showToast, userId]);

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
