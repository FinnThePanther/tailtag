import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  FursuitCard,
  fetchMySuits,
  MY_SUITS_QUERY_KEY,
  MY_SUITS_COUNT_QUERY_KEY,
  MY_SUITS_STALE_TIME,
} from '../../../src/features/suits';
import {
  PendingCatchesList,
  useConfirmCatch,
  usePendingCatches,
} from '../../../src/features/catch-confirmations';
import { MAX_FURSUITS_PER_USER } from '../../../src/constants/fursuits';
import type { FursuitSummary } from '../../../src/features/suits';
import { TailTagButton } from '../../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../../src/components/ui/TailTagCard';
import { FURSUIT_BUCKET } from '../../../src/constants/storage';
import { useAuth } from '../../../src/features/auth';
import { supabase } from '../../../src/lib/supabase';
import { colors } from '../../../src/theme';
import { toDisplayDate } from '../../../src/utils/dates';
import { deriveStoragePathFromPublicUrl } from '../../../src/utils/storage';
import { styles } from '../../../src/app-styles/(tabs)/suits/index.styles';

export default function MySuitsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const suitsQueryKey = useMemo(() => [MY_SUITS_QUERY_KEY, userId] as const, [userId]);

  const queryClient = useQueryClient();
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

  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [processingCatchId, setProcessingCatchId] = useState<string | null>(null);

  const { data: pendingCatches = [], refetch: refetchPendingCatches } = usePendingCatches();
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
        setActionError(null);
        return;
      }

      setActionError(null);
      const state = queryClient.getQueryState<FursuitSummary[]>(suitsQueryKey);

      if (
        !state ||
        state.isInvalidated ||
        (state.status === 'success' && Date.now() - state.dataUpdatedAt > MY_SUITS_STALE_TIME)
      ) {
        void refetch({ throwOnError: false });
      }
    }, [queryClient, refetch, setActionError, suitsQueryKey, userId]),
  );

  const handleRefresh = useCallback(async () => {
    setActionError(null);
    await Promise.all([refetch({ throwOnError: false }), refetchPendingCatches()]);
  }, [refetch, refetchPendingCatches]);

  const handleDelete = useCallback(
    (suit: FursuitSummary) => {
      if (!userId || deletingId) {
        return;
      }

      Alert.alert(
        'Remove fursuit?',
        `Remove ${suit.name} from your fursuits? You can always add it back later.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              setDeletingId(suit.id);
              setActionError(null);

              try {
                const objectPath = deriveStoragePathFromPublicUrl(suit.avatar_url, FURSUIT_BUCKET);

                if (objectPath) {
                  const { error: storageError } = await supabase.storage
                    .from(FURSUIT_BUCKET)
                    .remove([objectPath]);

                  if (storageError) {
                    console.warn('Failed to remove fursuit avatar from storage', storageError);
                  }
                }

                const { error: deleteError } = await (supabase as any)
                  .from('fursuits')
                  .delete()
                  .eq('id', suit.id)
                  .eq('owner_id', userId);

                if (deleteError) {
                  throw deleteError;
                }

                queryClient.setQueryData<FursuitSummary[]>(suitsQueryKey, (current) =>
                  (current ?? []).filter((item) => item.id !== suit.id),
                );

                // Invalidate count cache so limit check updates immediately
                void queryClient.invalidateQueries({
                  queryKey: [MY_SUITS_COUNT_QUERY_KEY, userId],
                });
              } catch (caught) {
                const message =
                  caught instanceof Error
                    ? caught.message
                    : "We couldn't delete that fursuit. Please try again.";
                setActionError(message);
              } finally {
                setDeletingId(null);
              }
            },
          },
        ],
      );
    },
    [queryClient, suitsQueryKey, userId, deletingId],
  );

  const hasSuits = suits.length > 0;
  const suitCount = suits.length;
  const isAtFursuitLimit = suitCount >= MAX_FURSUITS_PER_USER;
  const combinedError = actionError ?? error?.message ?? null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Your suits</Text>
        <Text style={styles.title}>Suit deck</Text>
        <Text style={styles.subtitle}>
          Keep your suits up to date so other players know who they just tagged.
        </Text>
      </View>

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
              const timelineLabel = suit.created_at
                ? `Added on ${toDisplayDate(suit.created_at)}`
                : null;

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
                    actionSlot={
                      <Pressable
                        onPress={() => handleDelete(suit)}
                        disabled={deletingId === suit.id}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Delete fursuit"
                        style={({ pressed }) => [
                          {
                            opacity: deletingId === suit.id ? 0.6 : pressed ? 0.8 : 1,
                          },
                        ]}
                      >
                        {deletingId === suit.id ? (
                          <Text style={styles.deleteLink}>Deleting…</Text>
                        ) : (
                          <Text style={styles.deleteLink}>Delete</Text>
                        )}
                      </Pressable>
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
