import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  CAUGHT_COLLECTION_QUERY_KEY,
  CaughtSuitRow,
  CAUGHT_SUITS_STALE_TIME,
  fetchCaughtCollection,
} from '../../src/features/suits';
import type {
  CaughtCollection,
  CaughtConventionFolder,
  CaughtRecord,
} from '../../src/features/suits';
import {
  PendingConfirmationsList,
  useMyPendingCatches,
} from '../../src/features/catch-confirmations';
import {
  CatchOutboxList,
  useCatchOutbox,
  useCatchOutboxSync,
} from '../../src/features/catch-outbox';
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
  conventionFolders: [],
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

export default function CaughtSuitsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const router = useRouter();
  const listRef = useRef<FlatList<CaughtRecord>>(null);
  const caughtCollectionKey = useMemo(
    () => [CAUGHT_COLLECTION_QUERY_KEY, userId] as const,
    [userId],
  );
  const [selectedConventionId, setSelectedConventionId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { visibleItems: outboxItems } = useCatchOutbox(userId);
  const {
    sync: syncOutbox,
    retry: retryOutboxItem,
    dismiss: dismissOutboxItem,
  } = useCatchOutboxSync(userId, queryClient);

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
      selectedConventionId
        ? (collection.conventionFolders.find(
            (folder) => folder.conventionId === selectedConventionId,
          ) ?? null)
        : null,
    [collection.conventionFolders, selectedConventionId],
  );

  const records = selectedFolder ? selectedFolder.catches : collection.allCatches;

  useEffect(() => {
    if (
      selectedConventionId &&
      !collection.conventionFolders.some((folder) => folder.conventionId === selectedConventionId)
    ) {
      setSelectedConventionId(null);
    }
  }, [collection.conventionFolders, selectedConventionId]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        return;
      }

      void syncOutbox();

      const state = queryClient.getQueryState<CaughtCollection>(caughtCollectionKey);

      if (
        !state ||
        state.isInvalidated ||
        (state.status === 'success' && Date.now() - state.dataUpdatedAt > CAUGHT_SUITS_STALE_TIME)
      ) {
        void refetch({ throwOnError: false });
      }
    }, [caughtCollectionKey, queryClient, refetch, syncOutbox, userId]),
  );

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      syncOutbox({ force: true }),
      refetch({ throwOnError: false }),
      refetchMyPendingCatches(),
    ]);
  }, [refetch, refetchMyPendingCatches, syncOutbox]);

  const errorMessage = error?.message ?? null;
  const pullHint = usePullToRefreshHint({ isRefreshing: isRefetching });

  useFocusEffect(
    useCallback(() => {
      if (!isRefetching) {
        requestAnimationFrame(() => {
          listRef.current?.scrollToOffset({ offset: 0, animated: false });
        });
      }
    }, [isRefetching]),
  );

  const renderItem = useCallback(
    ({ item }: { item: CaughtRecord }) => (
      <CaughtSuitRow
        name={item.fursuitRedacted ? 'Unavailable fursuit' : (item.fursuit?.name ?? 'Unknown')}
        species={item.fursuitRedacted ? null : item.fursuit?.species}
        avatarUrl={item.fursuitRedacted ? null : item.fursuit?.avatar_url}
        caughtAt={item.caught_at}
        onPress={() => {
          router.push({
            pathname: '/catches/[id]',
            params: { id: item.id },
          });
        }}
      />
    ),
    [router],
  );

  const keyExtractor = useCallback((item: CaughtRecord) => item.id, []);

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
        isActive: selectedConventionId === folder.conventionId,
        onPress: () => setSelectedConventionId(folder.conventionId),
      }),
    [renderFilterButton, selectedConventionId],
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
          {renderFilterButton({
            id: 'all',
            label: 'All catches',
            meta: formatCatchCount(collection.allCatches.length),
            isActive: selectedConventionId === null,
            onPress: () => setSelectedConventionId(null),
          })}
          {collection.conventionFolders.map(renderFolderFilter)}
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
    collection.conventionFolders,
    errorMessage,
    isLoading,
    handleOpenSelectedFolderRecap,
    renderFilterButton,
    renderFolderFilter,
    selectedConventionId,
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
      ref={listRef}
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
          <CatchOutboxList
            items={outboxItems}
            onRetry={retryOutboxItem}
            onDismiss={dismissOutboxItem}
          />
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
