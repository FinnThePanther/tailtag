import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  FursuitCard,
  fetchMySuits,
  consumeSuitAutoEnrollNotice,
  hasSeenSuitAutoEnrollMigrationNotice,
  markSuitAutoEnrollMigrationNoticeSeen,
  MY_SUITS_STALE_TIME,
  mySuitsQueryKey,
} from '../../../src/features/suits';
import {
  PENDING_CATCHES_STALE_TIME,
  PendingCatchesList,
  pendingCatchesQueryKey,
  useConfirmCatch,
  usePendingCatches,
} from '../../../src/features/catch-confirmations';
import {
  CatchOutboxList,
  useCatchOutbox,
  useCatchOutboxSync,
} from '../../../src/features/catch-outbox';
import { MAX_FURSUITS_PER_USER } from '../../../src/constants/fursuits';
import type { FursuitSummary } from '../../../src/features/suits';
import { TailTagButton } from '../../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../../src/components/ui/TailTagCard';
import { PullToRefreshHint } from '../../../src/components/ui/PullToRefreshHint';
import { useAuth } from '../../../src/features/auth';
import { getIncompleteFursuitProfiles } from '../../../src/features/profile-guidance';
import { usePullToRefreshHint } from '../../../src/hooks/usePullToRefreshHint';
import { getUserVisibleErrorMessage } from '@/lib/userVisibleErrors';
import { colors } from '../../../src/theme';
import { toDisplayDate } from '../../../src/utils/dates';
import { styles } from '../../../src/app-styles/(tabs)/suits/index.styles';

export default function MySuitsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    guidance?: string;
    conventionId?: string;
    conventionName?: string;
  }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const suitsQueryKey = useMemo(() => mySuitsQueryKey(userId ?? 'guest'), [userId]);
  const pendingCatchesKey = useMemo(() => pendingCatchesQueryKey(userId ?? ''), [userId]);
  const autoEnrollNoticeShownRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const queryClient = useQueryClient();
  const { visibleItems: outboxItems } = useCatchOutbox(userId);
  const {
    sync: syncOutbox,
    retry: retryOutboxItem,
    dismiss: dismissOutboxItem,
  } = useCatchOutboxSync(userId, queryClient);
  const {
    data: suits = [],
    error,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<FursuitSummary[], Error>({
    queryKey: suitsQueryKey,
    enabled: Boolean(userId),
    staleTime: MY_SUITS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchMySuits(userId!),
  });

  const [processingCatchId, setProcessingCatchId] = useState<string | null>(null);

  const {
    data: pendingCatches = [],
    isRefetching: isPendingCatchesRefetching,
    refetch: refetchPendingCatches,
  } = usePendingCatches();
  const confirmCatchMutation = useConfirmCatch();

  const handleAcceptCatch = useCallback(
    (catchId: string, conventionId?: string) => {
      setProcessingCatchId(catchId);
      confirmCatchMutation.mutate(
        { catchId, decision: 'accept', conventionId },
        { onSettled: () => setProcessingCatchId(null) },
      );
    },
    [confirmCatchMutation],
  );

  const handleRejectCatch = useCallback(
    (catchId: string) => {
      setProcessingCatchId(catchId);
      confirmCatchMutation.mutate(
        { catchId, decision: 'reject' },
        { onSettled: () => setProcessingCatchId(null) },
      );
    },
    [confirmCatchMutation],
  );

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        return;
      }

      void syncOutbox();

      const state = queryClient.getQueryState<FursuitSummary[]>(suitsQueryKey);

      if (
        !state ||
        state.isInvalidated ||
        (state.status === 'success' && Date.now() - state.dataUpdatedAt > MY_SUITS_STALE_TIME)
      ) {
        void refetch({ throwOnError: false });
      }

      const pendingState = queryClient.getQueryState(pendingCatchesKey);
      if (
        !pendingState ||
        pendingState.isInvalidated ||
        (pendingState.status === 'success' &&
          Date.now() - pendingState.dataUpdatedAt > PENDING_CATCHES_STALE_TIME)
      ) {
        void refetchPendingCatches();
      }
    }, [
      pendingCatchesKey,
      queryClient,
      refetch,
      refetchPendingCatches,
      suitsQueryKey,
      syncOutbox,
      userId,
    ]),
  );

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      syncOutbox({ force: true }),
      refetch({ throwOnError: false }),
      refetchPendingCatches(),
    ]);
  }, [refetch, refetchPendingCatches, syncOutbox]);

  const isRefreshing = isRefetching || isPendingCatchesRefetching;
  const pullHint = usePullToRefreshHint({ isRefreshing });

  useFocusEffect(
    useCallback(() => {
      if (!isRefreshing) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ y: 0, animated: false });
        });
      }
    }, [isRefreshing]),
  );

  const hasSuits = suits.length > 0;
  const hasConventionListedSuits = useMemo(
    () => suits.some((suit) => suit.conventions.length > 0),
    [suits],
  );
  const suitCount = suits.length;
  const isAtFursuitLimit = suitCount >= MAX_FURSUITS_PER_USER;
  const combinedError = error
    ? getUserVisibleErrorMessage(error, "We couldn't load your fursuits.")
    : null;
  const incompleteGuidanceSuits = useMemo(() => getIncompleteFursuitProfiles(suits), [suits]);
  const showFursuitGuidance =
    params.guidance === 'fursuit-profile' && incompleteGuidanceSuits.length > 0;
  const rosterGuidanceConventionId =
    params.guidance === 'convention-roster' && typeof params.conventionId === 'string'
      ? params.conventionId
      : null;
  const rosterGuidanceConventionName =
    typeof params.conventionName === 'string' && params.conventionName.trim().length > 0
      ? params.conventionName
      : 'this convention';
  const rosterGuidanceSuits = rosterGuidanceConventionId ? suits : [];
  const showRosterGuidance = Boolean(rosterGuidanceConventionId);

  useEffect(() => {
    if (!userId || isLoading || error || !hasSuits || autoEnrollNoticeShownRef.current) {
      return;
    }

    let cancelled = false;

    const showNotice = (conventionName?: string | null) => {
      autoEnrollNoticeShownRef.current = true;
      const target = conventionName?.trim() || 'your convention';
      Alert.alert(
        'Your suits are listed by default',
        `TailTag now adds every suit in your account to ${target} automatically. If a suit is not catchable there, open that suit, edit its convention roster, and remove it or turn off “Show on roster.”`,
        [{ text: 'Review suits' }, { text: 'Got it', style: 'cancel' }],
      );
    };

    void (async () => {
      const pendingNotice = await consumeSuitAutoEnrollNotice(userId);
      if (cancelled) {
        return;
      }

      if (pendingNotice) {
        showNotice(pendingNotice.conventionName);
        return;
      }

      if (!hasConventionListedSuits) {
        return;
      }

      const hasSeenMigrationNotice = await hasSeenSuitAutoEnrollMigrationNotice(userId);
      if (cancelled || hasSeenMigrationNotice) {
        return;
      }

      await markSuitAutoEnrollMigrationNoticeSeen(userId);
      if (!cancelled) {
        showNotice();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [error, hasConventionListedSuits, hasSuits, isLoading, userId]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.container}
      alwaysBounceVertical
      onScroll={pullHint.onScroll}
      onScrollBeginDrag={pullHint.onScrollBeginDrag}
      onScrollEndDrag={pullHint.onScrollEndDrag}
      onMomentumScrollEnd={pullHint.onMomentumScrollEnd}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <PullToRefreshHint state={pullHint.state} />

      <CatchOutboxList
        items={outboxItems}
        onRetry={retryOutboxItem}
        onDismiss={dismissOutboxItem}
      />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Your suits</Text>
        <Text style={styles.title}>Suit deck</Text>
        <Text style={styles.subtitle}>
          Keep your suits up to date so other players know who they just tagged.
        </Text>
      </View>

      {showFursuitGuidance ? (
        <TailTagCard style={styles.guidanceCard}>
          <Text style={styles.guidanceEyebrow}>Next step</Text>
          <Text style={styles.guidanceTitle}>Fill out "Ask Me About"</Text>
          <Text style={styles.guidanceBody}>
            Review each suit's conversation starter before this step is complete.
          </Text>
          <View style={styles.guidanceSuitList}>
            {incompleteGuidanceSuits.map((suit) => (
              <Pressable
                key={suit.id}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${suit.name}`}
                accessibilityHint="Opens the fursuit editor"
                onPress={() =>
                  router.push({
                    pathname: '/fursuits/[id]/edit',
                    params: { id: suit.id },
                  })
                }
                style={({ pressed }) => [
                  styles.guidanceSuitRow,
                  pressed ? styles.guidanceSuitRowPressed : null,
                ]}
              >
                <View style={styles.guidanceSuitTextBlock}>
                  <Text style={styles.guidanceSuitName}>{suit.name}</Text>
                  <Text style={styles.guidanceSuitMeta}>Finish profile details</Text>
                </View>
                <Text style={styles.guidanceSuitAction}>Edit</Text>
              </Pressable>
            ))}
          </View>
        </TailTagCard>
      ) : null}

      {showRosterGuidance ? (
        <TailTagCard style={styles.guidanceCard}>
          <Text style={styles.guidanceEyebrow}>Roster update</Text>
          <Text style={styles.guidanceTitle}>Review suits for {rosterGuidanceConventionName}</Text>
          <Text style={styles.guidanceBody}>
            TailTag listed every suit in your account for this convention. Open any suit that should
            not be catchable there and remove the convention or turn off Show on roster.
          </Text>
          {isLoading ? (
            <Text style={styles.message}>Loading your suits…</Text>
          ) : combinedError ? (
            <View style={styles.helperColumn}>
              <Text style={styles.error}>{combinedError}</Text>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={handleRefresh}
              >
                Try again
              </TailTagButton>
            </View>
          ) : hasSuits ? (
            <View style={styles.guidanceSuitList}>
              {rosterGuidanceSuits.map((suit) => {
                const isListed = suit.conventions.some(
                  (convention) => convention.id === rosterGuidanceConventionId,
                );
                return (
                  <Pressable
                    key={suit.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${suit.name}`}
                    accessibilityHint="Opens the fursuit editor"
                    onPress={() =>
                      router.push({
                        pathname: '/fursuits/[id]/edit',
                        params: { id: suit.id },
                      })
                    }
                    style={({ pressed }) => [
                      styles.guidanceSuitRow,
                      pressed ? styles.guidanceSuitRowPressed : null,
                    ]}
                  >
                    <View style={styles.guidanceSuitTextBlock}>
                      <Text style={styles.guidanceSuitName}>{suit.name}</Text>
                      <Text style={styles.guidanceSuitMeta}>
                        {isListed ? 'Listed by default' : 'Not listed'}
                      </Text>
                    </View>
                    <Text style={styles.guidanceSuitAction}>Edit</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.guidanceBody}>
              Add a suit if you&apos;re bringing one to {rosterGuidanceConventionName}.
            </Text>
          )}
          {!isAtFursuitLimit ? (
            <View style={styles.guidanceActions}>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={() =>
                  router.push({
                    pathname: '/suits/add-fursuit',
                    params: rosterGuidanceConventionId
                      ? { conventionId: rosterGuidanceConventionId }
                      : undefined,
                  })
                }
              >
                Add a fursuit
              </TailTagButton>
            </View>
          ) : null}
        </TailTagCard>
      ) : null}

      {userId ? (
        <PendingCatchesList
          pendingCatches={pendingCatches}
          processingCatchId={processingCatchId}
          onAccept={handleAcceptCatch}
          onReject={handleRejectCatch}
        />
      ) : null}

      <TailTagCard style={styles.cardSpacing}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your fursuits</Text>
          <Text style={styles.sectionMeta}>
            {hasSuits ? `${suitCount} ${suitCount === 1 ? 'suit' : 'suits'}` : 'No suits yet'}
          </Text>
        </View>
        {isLoading ? (
          <Text style={styles.message}>Loading your suits…</Text>
        ) : combinedError ? (
          <View style={styles.helperColumn}>
            <Text style={styles.error}>{combinedError}</Text>
            <TailTagButton
              variant="outline"
              size="sm"
              onPress={handleRefresh}
            >
              Try again
            </TailTagButton>
          </View>
        ) : hasSuits ? (
          <View style={styles.list}>
            {suits.map((suit, index) => {
              const addedLabel = suit.created_at
                ? `Added on ${toDisplayDate(suit.created_at)}`
                : null;
              const timelineLabel =
                suit.ownerAttributionVisibility === 'hidden'
                  ? [addedLabel, 'Owner hidden publicly'].filter(Boolean).join(' · ')
                  : addedLabel;

              return (
                <View
                  key={suit.id}
                  style={index < suits.length - 1 ? styles.listItemSpacing : undefined}
                >
                  <FursuitCard
                    name={suit.name}
                    species={suit.species}
                    colors={suit.colors}
                    avatarUrl={suit.avatar_url}
                    uniqueCode={suit.unique_code}
                    timelineLabel={timelineLabel}
                    onPress={() =>
                      router.push({
                        pathname: '/fursuits/[id]',
                        params: { id: suit.id },
                      })
                    }
                  />
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.message}>
            You haven&apos;t added any suits yet. Tap “Add a fursuit” below to get started.
          </Text>
        )}
      </TailTagCard>

      <TailTagCard style={styles.cardSpacing}>
        <View style={styles.helperRow}>
          <Text style={styles.helperText}>
            {isAtFursuitLimit
              ? `You have ${MAX_FURSUITS_PER_USER}/${MAX_FURSUITS_PER_USER} suits. Delete one to add another.`
              : `Add a new suit before you head to the floor. (${suitCount}/${MAX_FURSUITS_PER_USER})`}
          </Text>
          <TailTagButton
            onPress={() => router.push('/suits/add-fursuit')}
            disabled={isAtFursuitLimit}
          >
            Add a fursuit
          </TailTagButton>
        </View>
      </TailTagCard>
    </ScrollView>
  );
}
