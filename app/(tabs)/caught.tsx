import { useCallback, useMemo } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { useFocusEffect, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  FursuitCard,
  FursuitBioDetails,
  CAUGHT_SUITS_QUERY_KEY,
  CAUGHT_SUITS_STALE_TIME,
  fetchCaughtSuits,
} from "../../src/features/suits";
import type { CaughtRecord } from "../../src/features/suits";
import { TailTagButton } from "../../src/components/ui/TailTagButton";
import { TailTagCard } from "../../src/components/ui/TailTagCard";
import { useAuth } from "../../src/features/auth";
import { colors, spacing } from "../../src/theme";
import { toDisplayDateTime } from "../../src/utils/dates";

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

function CaughtSuitItem({
  record,
  onPress,
}: {
  record: CaughtRecord;
  onPress: () => void;
}) {
  const details = record.fursuit;

  if (!details) {
    return null;
  }

  const caughtLabel = toDisplayDateTime(record.caught_at) ?? "Caught just now";
  const pieces = [caughtLabel];

  if (typeof record.catchNumber === "number" && record.catchNumber > 0) {
    pieces.push(`Catcher #${record.catchNumber}`);
  }

  const timelineLabel = pieces.join(" · ");

  return (
    <View>
      <FursuitCard
        name={details.name}
        species={details.species}
        colors={details.colors}
        avatarUrl={details.avatar_url}
        uniqueCode={details.unique_code}
        timelineLabel={timelineLabel}
        codeLabel={undefined}
        onPress={onPress}
      />
      {details.bio ? (
        <View style={styles.bioSpacing}>
          <TailTagCard>
            <FursuitBioDetails bio={details.bio} />
          </TailTagCard>
        </View>
      ) : null}
    </View>
  );
}

export default function CaughtSuitsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const router = useRouter();
  const caughtSuitsKey = useMemo(
    () => [CAUGHT_SUITS_QUERY_KEY, userId] as const,
    [userId],
  );

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
        (state.status === "success" &&
          Date.now() - state.dataUpdatedAt > CAUGHT_SUITS_STALE_TIME)
      ) {
        void refetch({ throwOnError: false });
      }
    }, [caughtSuitsKey, queryClient, refetch, userId]),
  );

  const handleRefresh = useCallback(async () => {
    await refetch({ throwOnError: false });
  }, [refetch]);

  const errorMessage = error?.message ?? null;

  const renderItem = useCallback(
    ({ item }: { item: CaughtRecord }) => (
      <CaughtSuitItem
        record={item}
        onPress={() => {
          if (item.fursuit?.id) {
            router.push({
              pathname: "/fursuits/[id]",
              params: { id: item.fursuit.id },
            });
          }
        }}
      />
    ),
    [router],
  );

  const keyExtractor = useCallback((item: CaughtRecord) => item.id, []);

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
            <TailTagButton variant="outline" size="sm" onPress={handleRefresh}>
              Try again
            </TailTagButton>
          </View>
        </TailTagCard>
      );
    }

    return (
      <TailTagCard>
        <Text style={styles.message}>
          You haven&apos;t caught any suits yet. Tap "Catch" to catch your first
          fursuiter.
        </Text>
      </TailTagCard>
    );
  }, [isLoading, errorMessage, handleRefresh]);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.container}
      data={records}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ItemSeparatorComponent={ItemSeparator}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={ListEmptyComponent}
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

const styles = StyleSheet.create({
  list: {
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
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 4,
    textTransform: "uppercase",
    color: colors.primary,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.foreground,
  },
  subtitle: {
    fontSize: 15,
    color: "rgba(203,213,225,0.9)",
  },
  message: {
    color: "rgba(203,213,225,0.9)",
    fontSize: 14,
  },
  helper: {
    gap: spacing.sm,
  },
  error: {
    color: "#fca5a5",
    fontSize: 14,
  },
  separator: {
    height: spacing.md,
  },
  bioSpacing: {
    marginTop: spacing.sm,
  },
});
