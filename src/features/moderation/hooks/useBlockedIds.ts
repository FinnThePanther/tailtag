import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchBlockedIds, blockedIdsQueryKey } from '../api/blocks';

export function useBlockedIds(userId: string | null) {
  const { data: blockedIds = [] } = useQuery({
    queryKey: blockedIdsQueryKey(userId ?? ''),
    queryFn: () => fetchBlockedIds(userId!),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const blockedSet = useMemo(() => new Set(blockedIds), [blockedIds]);

  return blockedSet;
}
