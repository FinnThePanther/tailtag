import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  CAUGHT_COLLECTION_QUERY_KEY,
  CaughtSuitRow,
  CAUGHT_SUITS_STALE_TIME,
  caughtSuitsQueryKey,
  fetchCaughtCollection,
} from '../../src/features/suits';
import type {
  CaughtSuitAggregate,
  CaughtCollection,
  CaughtConventionFolder,
  CaughtRecord,
} from '../../src/features/suits';
import {
  PendingConfirmationsList,
  useMyPendingCatches,
} from '../../src/features/catch-confirmations';
import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { PullToRefreshHint } from '../../src/components/ui/PullToRefreshHint';
import { useAuth } from '../../src/features/auth';
import { formatConventionDateRange } from '../../src/features/conventions';
import { usePullToRefreshHint } from '../../src/hooks/usePullToRefreshHint';
import { colors } from '../../src/theme';
import { styles } from '../../src/app-styles/(tabs)/caught.styles';

const EMPTY_CAUGHT_COLLECTION: CaughtCollection = {
  allCatches: [],
  allCaughtSuits: [],
  conventionFolders: [],
};

const ALL_CATCHES_FILTER_ID = 'all';

type CaughtListItem =
  | {
      kind: 'catch';
      record: CaughtRecord;
    }
  | {
      kind: 'suit';
      aggregate: CaughtSuitAggregate;
    };

function ListHeader() {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>Caught suits</Text>
      <Text style={styles.title}>Your collection</Text>
      <Text style={styles.subtitle}>
        Every catch you log shows up here. Keep tagging to grow your collection!
      </Text>
    </View>
  );
}

function ItemSeparator() {
  return <View style={styles.separator} />;
}

function formatCatchCount(count: number) {
  return count === 1 ? '1 catch' : `${count.toLocaleString()} catches`;
}

function shouldCollapseCaughtSuitAggregate(aggregate: CaughtSuitAggregate) {
  return aggregate.catchCount === 1 || aggregate.catches.every((record) => record.conventionId);
}

function mapAggregateToListItems(aggregate: CaughtSuitAggregate): CaughtListItem[] {
  if (shouldCollapseCaughtSuitAggregate(aggregate)) {
    return [{ kind: 'suit', aggregate }];
  }

  return aggregate.catches.map((record) => ({ kind: 'catch', record }));
}

export default function CaughtSuitsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const router = useRouter();
  const caughtCollectionKey = useMemo(
    () => [CAUGHT_COLLECTION_QUERY_KEY, userId] as const,
    [userId],
  );
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data: myPendingCatches = [], refetch: refetchMyPendingCatches } = useMyPendingCatches();

  const {
    data: collection = EMPTY_CAUGHT_COLLECTION,
    error,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<CaughtCollection, Error>({
    queryKey: caughtCollectionKey,
    enabled: Boolean(userId),
    staleTime: CAUGHT_SUITS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchCaughtCollection(userId!),
  });

  const selectedFolder = useMemo(
    () =>
      activeFilterId && activeFilterId !== ALL_CATCHES_FILTER_ID
        ? (collection.conventionFolders.find((folder) => folder.conventionId === activeFilterId) ??
          null)
        : null,
    [activeFilterId, collection.conventionFolders],
  );

  const records = useMemo<CaughtListItem[]>(() => {
    if (activeFilterId === ALL_CATCHES_FILTER_ID || !selectedFolder) {
      return collection.allCaughtSuits.flatMap(mapAggregateToListItems);
    }

    return selectedFolder.catches.map((record) => ({ kind: 'catch', record }));
  }, [activeFilterId, collection.allCaughtSuits, selectedFolder]);

  useEffect(() => {
    if (collection.allCatches.length === 0) {
      setActiveFilterId(null);
      return;
    }

    const fallbackFilterId = collection.conventionFolders[0]?.conventionId ?? ALL_CATCHES_FILTER_ID;

    if (activeFilterId === null) {
      setActiveFilterId(fallbackFilterId);
      return;
    }

    if (
      activeFilterId !== ALL_CATCHES_FILTER_ID &&
      !collection.conventionFolders.some((folder) => folder.conventionId === activeFilterId)
    ) {
      setActiveFilterId(fallbackFilterId);
    }
  }, [activeFilterId, collection.allCatches.length, collection.conventionFolders]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        return;
      }

      const state = queryClient.getQueryState<CaughtCollection>(caughtCollectionKey);

      if (
        !state ||
        state.isInvalidated ||
        (state.status === 'success' && Date.now() - state.dataUpdatedAt > CAUGHT_SUITS_STALE_TIME)
      ) {
        void refetch({ throwOnError: false });
      }
    }, [caughtCollectionKey, queryClient, refetch, userId]),
  );

  const handleRefresh = useCallback(async () => {
    await Promise.all([refetch({ throwOnError: false }), refetchMyPendingCatches()]);
  }, [refetch, refetchMyPendingCatches]);

  const errorMessage = error?.message ?? null;
  const pullHint = usePullToRefreshHint({ isRefreshing: isRefetching });

  const handleOpenCatch = useCallback(
    (record: CaughtRecord) => {
      if (userId) {
        queryClient.setQueryData<CaughtRecord[]>(caughtSuitsQueryKey(userId), (existing) => {
          const sourceRecords = existing ?? collection.allCatches;

          if (sourceRecords.some((existingRecord) => existingRecord.id === record.id)) {
            return sourceRecords.map((existingRecord) =>
              existingRecord.id === record.id ? record : existingRecord,
            );
          }

          return [record, ...sourceRecords];
        });
      }

      router.push({
        pathname: '/catches/[id]',
        params: { id: record.id },
      });
    },
    [collection.allCatches, queryClient, router, userId],
  );

  const renderItem = useCallback(
    ({ item }: { item: CaughtListItem }) => {
      const record = item.kind === 'suit' ? item.aggregate.latestCatch : item.record;

      return (
        <CaughtSuitRow
          name={
            record.fursuitRedacted ? 'Unavailable fursuit' : (record.fursuit?.name ?? 'Unknown')
          }
          species={record.fursuitRedacted ? null : record.fursuit?.species}
          avatarUrl={record.fursuitRedacted ? null : record.fursuit?.avatar_url}
          caughtAt={record.caught_at}
          conventionName={record.convention?.name}
          catchCount={item.kind === 'suit' ? item.aggregate.catchCount : 1}
          onPress={() => handleOpenCatch(record)}
        />
      );
    },
    [handleOpenCatch],
  );

  const keyExtractor = useCallback((item: CaughtListItem) => {
    if (item.kind === 'suit') {
      return `suit-${item.aggregate.id}`;
    }

    return `catch-${item.record.id}`;
  }, []);

  const renderFilterButton = useCallback(
    ({
      id,
      label,
      meta,
      isActive,
      onPress,
    }: {
      id: string;
      label: string;
      meta: string;
      isActive: boolean;
      onPress: () => void;
    }) => (
      <Pressable
        key={id}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.filterButton,
          isActive && styles.filterButtonActive,
          pressed && styles.filterButtonPressed,
        ]}
      >
        <Text
          style={[styles.filterLabel, isActive && styles.filterLabelActive]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          style={[styles.filterMeta, isActive && styles.filterMetaActive]}
          numberOfLines={1}
        >
          {meta}
        </Text>
      </Pressable>
    ),
    [],
  );

  const renderFolderFilter = useCallback(
    (folder: CaughtConventionFolder) =>
      renderFilterButton({
        id: folder.conventionId,
        label: folder.conventionName,
        meta: formatCatchCount(folder.catchCount),
        isActive: activeFilterId === folder.conventionId,
        onPress: () => setActiveFilterId(folder.conventionId),
      }),
    [activeFilterId, renderFilterButton],
  );

  const handleOpenSelectedFolderRecap = useCallback(() => {
    if (!selectedFolder?.recapId) {
      return;
    }

    router.push({
      pathname: '/convention-recaps/[recapId]',
      params: { recapId: selectedFolder.recapId },
    });
  }, [router, selectedFolder]);

  const FilterControls = useMemo(() => {
    if (isLoading || errorMessage || collection.allCatches.length === 0) {
      return null;
    }

    return (
      <View style={styles.collectionControls}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {collection.conventionFolders.map(renderFolderFilter)}
          {renderFilterButton({
            id: ALL_CATCHES_FILTER_ID,
            label: 'All catches',
            meta:
              collection.allCaughtSuits.length === 1
                ? '1 suit'
                : `${collection.allCaughtSuits.length.toLocaleString()} suits`,
            isActive: activeFilterId === ALL_CATCHES_FILTER_ID,
            onPress: () => setActiveFilterId(ALL_CATCHES_FILTER_ID),
          })}
        </ScrollView>
        {selectedFolder ? (
          <View style={styles.folderSummary}>
            <View style={styles.folderSummaryText}>
              <Text
                style={styles.folderTitle}
                numberOfLines={1}
              >
                {selectedFolder.conventionName}
              </Text>
              <Text
                style={styles.folderMeta}
                numberOfLines={2}
              >
                {[
                  formatConventionDateRange(selectedFolder.startDate, selectedFolder.endDate),
                  formatCatchCount(selectedFolder.catchCount),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {selectedFolder.recapId ? (
              <View style={styles.folderRecapAction}>
                <TailTagButton
                  size="sm"
                  onPress={handleOpenSelectedFolderRecap}
                  accessibilityLabel={`View recap for ${selectedFolder.conventionName}`}
                  accessibilityHint="Opens your convention recap details"
                >
                  View recap
                </TailTagButton>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }, [
    collection.allCatches.length,
    collection.allCaughtSuits.length,
    collection.conventionFolders,
    errorMessage,
    isLoading,
    handleOpenSelectedFolderRecap,
    renderFilterButton,
    renderFolderFilter,
    activeFilterId,
    selectedFolder,
  ]);

  const ListEmptyComponent = useMemo(() => {
    if (isLoading) {
      return (
        <TailTagCard>
          <Text style={styles.message}>Loading your catches…</Text>
        </TailTagCard>
      );
    }

    if (errorMessage) {
      return (
        <TailTagCard>
          <View style={styles.helper}>
            <Text style={styles.error}>{errorMessage}</Text>
            <TailTagButton
              variant="outline"
              size="sm"
              onPress={handleRefresh}
            >
              Try again
            </TailTagButton>
          </View>
        </TailTagCard>
      );
    }

    if (selectedFolder) {
      return (
        <TailTagCard>
          <Text style={styles.message}>
            No catches are available in this convention folder yet.
          </Text>
        </TailTagCard>
      );
    }

    return (
      <TailTagCard>
        <Text style={styles.message}>
          You haven&apos;t caught any suits yet. Tap "Catch" to catch your first fursuiter.
        </Text>
      </TailTagCard>
    );
  }, [isLoading, errorMessage, handleRefresh, selectedFolder]);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.container}
      data={records}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ItemSeparatorComponent={ItemSeparator}
      ListHeaderComponent={
        <View>
          <PullToRefreshHint state={pullHint.state} />
          <ListHeader />
          <PendingConfirmationsList pendingCatches={myPendingCatches} />
          {FilterControls}
        </View>
      }
      ListEmptyComponent={ListEmptyComponent}
      onScroll={pullHint.onScroll}
      onScrollBeginDrag={pullHint.onScrollBeginDrag}
      onScrollEndDrag={pullHint.onScrollEndDrag}
      onMomentumScrollEnd={pullHint.onMomentumScrollEnd}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
    />
  );
}
