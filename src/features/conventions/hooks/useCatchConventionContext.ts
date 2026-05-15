import { useCallback, useMemo } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import type { FursuitPickerItem } from '@/features/catch-confirmations';
import {
  CONVENTIONS_STALE_TIME,
  PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY,
  conventionSuitRosterCaughtIdsQueryKey,
  conventionSuitRosterQueryKey,
  createConventionSuitRosterCaughtIdsQueryOptions,
  createConventionSuitRosterQueryOptions,
  fetchProfileConventionMemberships,
  type ConventionMembership,
} from '@/features/conventions/api/conventions';

const activeConventionIdsFromMemberships = (memberships: ConventionMembership[]) =>
  memberships
    .filter((membership) => membership.membership_state === 'active')
    .map((membership) => membership.convention_id);

export function useCatchConventionContext(userId: string | null) {
  const queryClient = useQueryClient();
  const membershipQuery = useQuery<ConventionMembership[], Error>({
    queryKey: [PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY, userId],
    enabled: Boolean(userId),
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: fetchProfileConventionMemberships,
  });
  const { refetch: refetchMemberships } = membershipQuery;

  const conventionMemberships = useMemo(() => membershipQuery.data ?? [], [membershipQuery.data]);
  const activeConventionIds = useMemo(
    () => activeConventionIdsFromMemberships(conventionMemberships),
    [conventionMemberships],
  );
  const singleActiveConventionId = activeConventionIds.length === 1 ? activeConventionIds[0] : null;

  const rosterQueries = useQueries({
    queries: activeConventionIds.map((conventionId) => ({
      ...createConventionSuitRosterQueryOptions(userId ?? '', conventionId),
      enabled: Boolean(userId),
    })),
  });

  const caughtIdQueries = useQueries({
    queries: activeConventionIds.map((conventionId) => ({
      ...createConventionSuitRosterCaughtIdsQueryOptions(userId ?? '', conventionId),
      enabled: Boolean(userId),
    })),
  });

  const pickerItems = useMemo<FursuitPickerItem[]>(() => {
    if (!userId) {
      return [];
    }

    const seen = new Set<string>();
    const items: FursuitPickerItem[] = [];

    rosterQueries.forEach((query) => {
      (query.data ?? []).forEach((entry) => {
        if (seen.has(entry.fursuitId)) return;
        if (entry.ownerProfileId === userId) return;
        if (entry.rosterVisible === false) return;

        seen.add(entry.fursuitId);
        items.push({
          id: entry.fursuitId,
          name: entry.name,
          avatarUrl: entry.avatarUrl,
          species: entry.species,
        });
      });
    });

    return items.sort((a, b) => a.name.localeCompare(b.name));
  }, [rosterQueries, userId]);

  const refresh = useCallback(async () => {
    const membershipResult = await refetchMemberships();
    const nextMemberships = membershipResult.data ?? [];
    const nextActiveConventionIds = activeConventionIdsFromMemberships(nextMemberships);

    await Promise.all(
      nextActiveConventionIds.flatMap((conventionId) => [
        queryClient.invalidateQueries({
          queryKey: conventionSuitRosterQueryKey(userId ?? '', conventionId),
        }),
        queryClient.invalidateQueries({
          queryKey: conventionSuitRosterCaughtIdsQueryKey(userId ?? '', conventionId),
        }),
      ]),
    );
  }, [queryClient, refetchMemberships, userId]);

  return {
    conventionMemberships,
    activeConventionIds,
    singleActiveConventionId,
    pickerItems,
    isMembershipLoading: membershipQuery.isPending,
    isRosterLoading:
      activeConventionIds.length > 0 &&
      rosterQueries.some((query) => query.isPending) &&
      !rosterQueries.some((query) => query.data !== undefined),
    isRosterRefreshing:
      rosterQueries.some((query) => query.isFetching && !query.isPending) ||
      caughtIdQueries.some((query) => query.isFetching && !query.isPending),
    hasCachedRoster: rosterQueries.some((query) => query.data !== undefined),
    refresh,
  };
}
