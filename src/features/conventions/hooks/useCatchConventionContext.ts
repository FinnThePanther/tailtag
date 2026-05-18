import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  FursuitPickerItem,
  ReciprocalFursuitPickerItem,
} from '@/features/catch-confirmations';
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
import {
  clearCatchConventionContextSnapshot,
  cleanupCatchConventionSnapshots,
  loadCatchConventionContextSnapshot,
  loadCatchConventionRosterSnapshots,
  saveCatchConventionContextSnapshot,
  saveCatchConventionRosterSnapshot,
  type CatchConventionContextSnapshot,
  type CatchConventionRosterSnapshot,
  type CatchConventionRosterSnapshotEntry,
} from '@/features/conventions/storage/catchConventionSnapshots';

const activeConventionIdsFromMemberships = (memberships: ConventionMembership[]) =>
  memberships
    .filter((membership) => membership.membership_state === 'active')
    .map((membership) => membership.convention_id);

export function useCatchConventionContext(userId: string | null) {
  const queryClient = useQueryClient();
  const [contextSnapshot, setContextSnapshot] = useState<CatchConventionContextSnapshot | null>(
    null,
  );
  const [rosterSnapshots, setRosterSnapshots] = useState<CatchConventionRosterSnapshot[]>([]);
  const savedRosterSnapshotSignaturesRef = useRef(new Map<string, string>());
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
  const liveActiveConventionIds = useMemo(
    () => activeConventionIdsFromMemberships(conventionMemberships),
    [conventionMemberships],
  );
  const snapshotActiveConventionIds = useMemo(
    () => contextSnapshot?.activeConventionIds ?? [],
    [contextSnapshot?.activeConventionIds],
  );
  const activeConventionIds = useMemo(
    () =>
      membershipQuery.data !== undefined ? liveActiveConventionIds : snapshotActiveConventionIds,
    [liveActiveConventionIds, membershipQuery.data, snapshotActiveConventionIds],
  );
  const singleActiveConventionId = activeConventionIds.length === 1 ? activeConventionIds[0] : null;

  useEffect(() => {
    let isMounted = true;

    async function loadSnapshots() {
      if (!userId) {
        setContextSnapshot(null);
        setRosterSnapshots([]);
        return;
      }

      const snapshot = await loadCatchConventionContextSnapshot(userId);
      if (!isMounted) return;

      setContextSnapshot(snapshot);
      if (!snapshot) {
        setRosterSnapshots([]);
        return;
      }

      const nextRosterSnapshots = await loadCatchConventionRosterSnapshots({
        userId,
        conventionIds: snapshot.activeConventionIds,
      });
      if (isMounted) {
        setRosterSnapshots(nextRosterSnapshots);
      }
    }

    void loadSnapshots();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || membershipQuery.data === undefined) {
      return;
    }

    if (liveActiveConventionIds.length === 0) {
      setContextSnapshot(null);
      void clearCatchConventionContextSnapshot(userId);
      return;
    }

    void saveCatchConventionContextSnapshot({
      userId,
      activeConventionIds: liveActiveConventionIds,
    });
  }, [liveActiveConventionIds, membershipQuery.data, userId]);

  useEffect(() => {
    if (!userId || activeConventionIds.length === 0) {
      return;
    }

    void cleanupCatchConventionSnapshots({
      userId,
      conventionIds: activeConventionIds,
    });
  }, [activeConventionIds, userId]);

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

  useEffect(() => {
    if (!userId) {
      return;
    }

    rosterQueries.forEach((query, index) => {
      const conventionId = activeConventionIds[index];
      if (!conventionId || query.data === undefined || query.isError) {
        return;
      }

      const signature = JSON.stringify({
        conventionId,
        fursuitIds: query.data.map((entry) => entry.fursuitId),
        count: query.data.length,
      });
      if (savedRosterSnapshotSignaturesRef.current.get(conventionId) === signature) {
        return;
      }
      savedRosterSnapshotSignaturesRef.current.set(conventionId, signature);

      void saveCatchConventionRosterSnapshot({
        userId,
        conventionId,
        entries: query.data,
      });
    });
  }, [activeConventionIds, rosterQueries, userId]);

  const snapshotByConventionId = useMemo(
    () => new Map(rosterSnapshots.map((snapshot) => [snapshot.conventionId, snapshot])),
    [rosterSnapshots],
  );

  const rosterPickerSources = useMemo(() => {
    let usedSnapshot = false;
    let snapshotCachedAt: string | null = null;
    const entries: CatchConventionRosterSnapshotEntry[] = [];

    activeConventionIds.forEach((conventionId, index) => {
      const liveEntries = rosterQueries[index]?.data;
      if (liveEntries !== undefined) {
        entries.push(
          ...liveEntries.map((entry) => ({
            fursuitId: entry.fursuitId,
            conventionId: entry.conventionId,
            name: entry.name,
            species: entry.species,
            avatarUrl: entry.avatarUrl,
            ownerProfileId: entry.ownerProfileId,
            rosterVisible: entry.rosterVisible !== false,
          })),
        );
        return;
      }

      const snapshot = snapshotByConventionId.get(conventionId);
      if (!snapshot) {
        return;
      }

      usedSnapshot = true;
      snapshotCachedAt =
        snapshotCachedAt && snapshotCachedAt < snapshot.cachedAt
          ? snapshotCachedAt
          : snapshot.cachedAt;
      entries.push(...snapshot.entries);
    });

    return { entries, snapshotCachedAt, usedSnapshot };
  }, [activeConventionIds, rosterQueries, snapshotByConventionId]);

  const pickerItems = useMemo<FursuitPickerItem[]>(() => {
    if (!userId) {
      return [];
    }

    const seen = new Set<string>();
    const items: FursuitPickerItem[] = [];

    rosterPickerSources.entries.forEach((entry) => {
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

    return items.sort((a, b) => a.name.localeCompare(b.name));
  }, [rosterPickerSources.entries, userId]);

  const reciprocalPickerItems = useMemo<ReciprocalFursuitPickerItem[]>(() => {
    if (!userId) {
      return [];
    }

    const byId = new Map<string, ReciprocalFursuitPickerItem>();

    rosterPickerSources.entries.forEach((entry) => {
      if (entry.ownerProfileId !== userId || entry.rosterVisible === false) return;

      const existing = byId.get(entry.fursuitId);
      if (existing) {
        if (!existing.conventionIds.includes(entry.conventionId)) {
          existing.conventionIds.push(entry.conventionId);
        }
        return;
      }

      byId.set(entry.fursuitId, {
        id: entry.fursuitId,
        name: entry.name,
        avatarUrl: entry.avatarUrl,
        species: entry.species,
        conventionIds: [entry.conventionId],
      });
    });

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rosterPickerSources.entries, userId]);

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
    reciprocalPickerItems,
    isMembershipLoading: membershipQuery.isPending,
    // isRosterLoading: initial load when activeConventionIds exist, rosterQueries are pending, and no rosterQueries have resolved data.
    isRosterLoading:
      activeConventionIds.length > 0 &&
      rosterQueries.some((query) => query.isPending) &&
      !rosterQueries.some((query) => query.data !== undefined),
    // isRosterRefreshing: background refresh when rosterQueries or caughtIdQueries are fetching outside their initial pending state.
    isRosterRefreshing:
      rosterQueries.some((query) => query.isFetching && !query.isPending) ||
      caughtIdQueries.some((query) => query.isFetching && !query.isPending),
    hasCachedRoster:
      rosterQueries.some((query) => query.data !== undefined) || rosterPickerSources.usedSnapshot,
    isUsingRosterSnapshot: rosterPickerSources.usedSnapshot,
    snapshotCachedAt: rosterPickerSources.snapshotCachedAt,
    refresh,
  };
}
