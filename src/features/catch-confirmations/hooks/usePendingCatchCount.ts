import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../../auth';
import {
  fetchPendingCatchCount,
  pendingCatchCountQueryKey,
  PENDING_CATCH_COUNT_STALE_TIME,
} from '../api/confirmations';

export function usePendingCatchCount() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return useQuery({
    queryKey: pendingCatchCountQueryKey(userId ?? ''),
    queryFn: () => fetchPendingCatchCount(userId!),
    enabled: Boolean(userId),
    staleTime: PENDING_CATCH_COUNT_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}
