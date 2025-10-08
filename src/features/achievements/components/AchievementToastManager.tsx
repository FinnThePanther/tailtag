import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../../auth';
import { useAchievementUnlockToast, useAchievementsRealtime } from '..';
import { achievementsStatusQueryKey, fetchAchievementStatus } from '../api/achievements';

/**
 * Mount once inside the app shell so achievement unlocks raise toasts in real time.
 */
export function AchievementToastManager() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const handleToast = useAchievementUnlockToast(userId);

  const statusQueryKey = useMemo(
    () => (userId ? achievementsStatusQueryKey(userId) : ['achievements-status', 'guest'] as const),
    [userId],
  );

  useQuery({
    queryKey: statusQueryKey,
    queryFn: () => fetchAchievementStatus(userId ?? ''),
    enabled: Boolean(userId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useAchievementsRealtime(userId, { onUnlocked: handleToast });

  return null;
}
