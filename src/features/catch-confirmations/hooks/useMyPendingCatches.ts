import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../../auth';
import {
  fetchMyPendingCatches,
  myPendingCatchesQueryKey,
  MY_PENDING_CATCHES_STALE_TIME,
} from '../api/myPendingCatches';

export function useMyPendingCatches() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return useQuery({
    queryKey: myPendingCatchesQueryKey(userId ?? ''),
    queryFn: () => fetchMyPendingCatches(userId!),
    enabled: Boolean(userId),
    staleTime: MY_PENDING_CATCHES_STALE_TIME,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
