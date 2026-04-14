import { Fragment, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../../auth';
import {
  PROFILE_CONVENTIONS_QUERY_KEY,
  fetchProfileConventionIds,
} from '../../conventions/api/conventions';
import { useDailyTasks } from '../hooks';

type DailyTaskWatcherProps = {
  userId: string;
  conventionId: string;
};

function DailyTaskWatcher({ userId, conventionId }: DailyTaskWatcherProps) {
  useDailyTasks(userId, conventionId, { suppressToasts: true });
  return null;
}

export function DailyTaskToastManager() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const { data: conventionIds = [] } = useQuery({
    queryKey: userId ? [PROFILE_CONVENTIONS_QUERY_KEY, userId] : ['profile-conventions', 'anon'],
    queryFn: () => fetchProfileConventionIds(userId ?? ''),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    placeholderData: [] as string[],
  });

  const watcherIds = useMemo(() => {
    return conventionIds.filter((id): id is string => Boolean(id));
  }, [conventionIds]);

  if (!userId || watcherIds.length === 0) {
    return null;
  }

  return (
    <Fragment>
      {watcherIds.map((conventionId) => (
        <DailyTaskWatcher
          key={`${userId}:${conventionId}`}
          userId={userId}
          conventionId={conventionId}
        />
      ))}
    </Fragment>
  );
}
