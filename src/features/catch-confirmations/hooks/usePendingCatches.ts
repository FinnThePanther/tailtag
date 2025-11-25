import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../../auth';
import {
  fetchPendingCatches,
  pendingCatchesQueryKey,
  PENDING_CATCHES_STALE_TIME,
} from '../api/confirmations';

export function usePendingCatches() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return useQuery({
    queryKey: pendingCatchesQueryKey(userId ?? ''),
    queryFn: () => fetchPendingCatches(userId!),
    enabled: Boolean(userId),
    staleTime: PENDING_CATCHES_STALE_TIME,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
