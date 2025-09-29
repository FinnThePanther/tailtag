import { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  FursuitCard,
  FursuitBioDetails,
  CAUGHT_SUITS_QUERY_KEY,
  CAUGHT_SUITS_STALE_TIME,
  fetchCaughtSuits,
} from '../../src/features/suits';
import type { CaughtRecord } from '../../src/features/suits';
import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { useAuth } from '../../src/features/auth';
import { colors, spacing } from '../../src/theme';
import { toDisplayDateTime } from '../../src/utils/dates';

export default function CaughtSuitsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const router = useRouter();
  const caughtSuitsKey = useMemo(() => [CAUGHT_SUITS_QUERY_KEY, userId] as const, [userId]);

  const queryClient = useQueryClient();

  const {
    data: records = [],
    error,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<CaughtRecord[], Error>({
    queryKey: caughtSuitsKey,
    enabled: Boolean(userId),
    staleTime: CAUGHT_SUITS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchCaughtSuits(userId!),
  });

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        return;
      }

      const state = queryClient.getQueryState<CaughtRecord[]>(caughtSuitsKey);

      if (
        !state ||
        state.isInvalidated ||
        (state.status === 'success' && Date.now() - state.dataUpdatedAt > CAUGHT_SUITS_STALE_TIME)
      ) {
        void refetch({ throwOnError: false });
      }
    }, [caughtSuitsKey, queryClient, refetch, userId])
  );

  const handleRefresh = useCallback(async () => {
    await refetch({ throwOnError: false });
  }, [refetch]);

  const hasRecords = records.length > 0;
  const errorMessage = error?.message ?? null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Caught suits</Text>
        <Text style={styles.title}>Your collection</Text>
        <Text style={styles.subtitle}>
          Every tag you log shows up here. Keep hunting to grow your streak.
        </Text>
      </View>

      <TailTagCard>
        {isLoading ? (
          <Text style={styles.message}>Loading your catches…</Text>
        ) : errorMessage ? (
          <View style={styles.helper}>
            <Text style={styles.error}>{errorMessage}</Text>
            <TailTagButton variant="outline" size="sm" onPress={handleRefresh}>
              Try again
            </TailTagButton>
          </View>
        ) : hasRecords ? (
          <View style={styles.list}>
            {records.map((record, index) => {
              const details = record.fursuit;

              if (!details) {
                return null;
              }

              const label = toDisplayDateTime(record.caught_at) ?? 'Caught just now';

              return (
                <View
                  key={record.id}
                  style={index < records.length - 1 ? styles.listItemSpacing : undefined}
                >
                  <FursuitCard
                    name={details.name}
                    species={details.species}
                    avatarUrl={details.avatar_url}
                    uniqueCode={details.unique_code}
                    timelineLabel={label}
                    codeLabel={undefined}
                    onPress={() => router.push({ pathname: '/fursuits/[id]', params: { id: details.id } })}
                  />
                  {details.bio ? (
                    <View style={styles.bioSpacing}>
                      <FursuitBioDetails bio={details.bio} />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.message}>
            You haven&apos;t caught any suits yet. Tap “Catch” to log a fresh tag.
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
  message: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  helper: {
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
  bioSpacing: {
    marginTop: spacing.sm,
  },
});
