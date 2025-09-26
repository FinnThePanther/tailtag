import { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  FursuitCard,
  fetchMySuits,
  MY_SUITS_QUERY_KEY,
  MY_SUITS_STALE_TIME,
} from '../../../src/features/suits';
import type { FursuitSummary } from '../../../src/features/suits';
import { TailTagButton } from '../../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../../src/components/ui/TailTagCard';
import { FURSUIT_BUCKET } from '../../../src/constants/storage';
import { useAuth } from '../../../src/features/auth';
import { supabase } from '../../../src/lib/supabase';
import { colors, spacing } from '../../../src/theme';
import { toDisplayDate } from '../../../src/utils/dates';
import { deriveStoragePathFromPublicUrl } from '../../../src/utils/storage';

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
    }, [queryClient, refetch, setActionError, suitsQueryKey, userId])
  );

  const handleRefresh = useCallback(async () => {
    setActionError(null);
    await refetch({ throwOnError: false });
  }, [refetch]);

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
                  (current ?? []).filter((item) => item.id !== suit.id)
                );
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
        ]
      );
    },
    [queryClient, suitsQueryKey, userId, deletingId]
  );

  const hasSuits = suits.length > 0;
  const combinedError = actionError ?? error?.message ?? null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Your suits</Text>
        <Text style={styles.title}>Tag deck</Text>
        <Text style={styles.subtitle}>
          Keep your suits up to date so other players know who they just tagged.
        </Text>
      </View>

      <TailTagCard style={styles.cardSpacing}>
        <View style={styles.helperRow}>
          <Text style={styles.helperText}>Add a new suit before you head to the floor.</Text>
          <TailTagButton onPress={() => router.push('/suits/add-fursuit')}>
            Add a fursuit
          </TailTagButton>
        </View>
      </TailTagCard>

      <TailTagCard>
        {isLoading ? (
          <Text style={styles.message}>Loading your suits…</Text>
        ) : combinedError ? (
          <View style={styles.helperColumn}>
            <Text style={styles.error}>{combinedError}</Text>
            <TailTagButton variant="outline" size="sm" onPress={handleRefresh}>
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
                <View key={suit.id} style={index < suits.length - 1 ? styles.listItemSpacing : undefined}>
                  <FursuitCard
                    name={suit.name}
                    species={suit.species}
                    avatarUrl={suit.avatar_url}
                    uniqueCode={suit.unique_code}
                    timelineLabel={timelineLabel}
                    actionSlot={
                      <TailTagButton
                        variant="destructive"
                        size="sm"
                        onPress={() => handleDelete(suit)}
                        loading={deletingId === suit.id}
                      >
                        Delete
                      </TailTagButton>
                    }
                  />
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.message}>
            You haven&apos;t added any suits yet. Tap “Add a fursuit” to get started.
          </Text>
        )}
      </TailTagCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.foreground,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(203,213,225,0.9)',
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  helperText: {
    color: 'rgba(203,213,225,0.9)',
    flex: 1,
    fontSize: 14,
  },
  cardSpacing: {
    marginBottom: spacing.lg,
  },
  message: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  helperColumn: {
    gap: spacing.sm,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
  },
  list: {
    marginTop: spacing.md,
  },
  listItemSpacing: {
    marginBottom: spacing.md,
  },
});
