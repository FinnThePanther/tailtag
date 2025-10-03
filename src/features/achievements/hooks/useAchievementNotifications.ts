import { useCallback } from 'react';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';

import {
  fetchPendingNotifications,
  acknowledgeNotifications,
  type AchievementNotification,
} from '../api/notifications';
import { achievementsStatusQueryKey } from '../api/achievements';

const NOTIFICATIONS_QUERY_KEY = 'achievement-notifications';

export function notificationsQueryKey(userId: string) {
  return [NOTIFICATIONS_QUERY_KEY, userId] as const;
}

export function useAchievementNotifications(userId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: userId ? notificationsQueryKey(userId) : ['achievement-notifications', 'anon'],
    queryFn: async () => {
      if (!userId) return [] as AchievementNotification[];
      return fetchPendingNotifications(userId);
    },
    enabled: Boolean(userId),
    refetchOnWindowFocus: false,
    staleTime: 5_000,
  });

  const mutation = useMutation({
    mutationFn: acknowledgeNotifications,
    onSuccess: (_data, ids) => {
      if (!userId) return;
      queryClient.setQueryData<AchievementNotification[] | undefined>(
        notificationsQueryKey(userId),
        (prev) => (prev ? prev.filter((item) => !ids.includes(item.id)) : prev),
      );
      // Refresh overall achievement status
      queryClient.invalidateQueries({ queryKey: achievementsStatusQueryKey(userId) }).catch(() => {});
    },
  });

  const acknowledge = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      await mutation.mutateAsync(ids);
    },
    [mutation],
  );

  return {
    notifications: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
    acknowledge,
  };
}
