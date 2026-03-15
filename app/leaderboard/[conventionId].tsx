import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../src/features/auth';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { TailTagButton } from '../../src/components/ui/TailTagButton';
import {
  createConventionLeaderboardQueryOptions,
  createConventionSuitLeaderboardQueryOptions,
  type LeaderboardEntry,
  type SuitLeaderboardEntry,
} from '../../src/features/leaderboard';
import { colors, radius, spacing } from '../../src/theme';

const formatCatchCount = (count: number) =>
  count === 1 ? '1 catch' : `${count} catches`;

export default function FullLeaderboardScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { conventionId, conventionName } = useLocalSearchParams<{
    conventionId: string;
    conventionName?: string;
  }>();

  const title = conventionName ? `${conventionName} · Standings` : 'Full Standings';

  const {
    data: leaderboardEntries = [],
    error: leaderboardError,
    isLoading: isLeaderboardLoading,
    refetch: refetchLeaderboard,
  } = useQuery<LeaderboardEntry[], Error>(
    createConventionLeaderboardQueryOptions(conventionId),
  );

  const {
    data: suitEntries = [],
    error: suitError,
    isLoading: isSuitLoading,
    refetch: refetchSuits,
  } = useQuery<SuitLeaderboardEntry[], Error>(
    createConventionSuitLeaderboardQueryOptions(conventionId),
  );

  const entriesWithCatches = leaderboardEntries.filter((e) => e.catchCount > 0);

  return (
    <View style={styles.wrapper}>
      <ScreenHeader title={title} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.container}>

        {/* Players section */}
        <Text style={styles.sectionTitle}>Catchers</Text>
        {isLeaderboardLoading ? (
          <Text style={styles.message}>Loading…</Text>
        ) : leaderboardError ? (
          <View style={styles.errorRow}>
            <Text style={styles.error}>{leaderboardError.message}</Text>
            <TailTagButton variant="outline" size="sm" onPress={() => void refetchLeaderboard({ throwOnError: false })}>
              Try again
            </TailTagButton>
          </View>
        ) : entriesWithCatches.length === 0 ? (
          <Text style={styles.message}>No catches yet.</Text>
        ) : (
          <View style={styles.list}>
            {entriesWithCatches.map((entry, index) => {
              const rank = index + 1;
              const isSelf = entry.profileId === userId;
              return (
                <Pressable
                  key={entry.profileId}
                  style={({ pressed }) => [
                    styles.row,
                    isSelf && styles.rowHighlight,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() =>
                    router.push({ pathname: '/profile/[id]', params: { id: entry.profileId } })
                  }
                >
                  <Text style={styles.rank}>#{rank}</Text>
                  <View style={styles.details}>
                    <Text style={styles.name} numberOfLines={1}>
                      {entry.username ?? 'Unnamed player'}
                      {isSelf ? ' · You' : ''}
                    </Text>
                    <Text style={styles.catchLabel} numberOfLines={1}>
                      {formatCatchCount(entry.catchCount)}
                    </Text>
                  </View>
                  {isSelf ? (
                    <Ionicons name="person" size={14} color={colors.primary} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.divider} />

        {/* Suits section */}
        <Text style={styles.sectionTitle}>Top Suits</Text>
        {isSuitLoading ? (
          <Text style={styles.message}>Loading…</Text>
        ) : suitError ? (
          <View style={styles.errorRow}>
            <Text style={styles.error}>{suitError.message}</Text>
            <TailTagButton variant="outline" size="sm" onPress={() => void refetchSuits({ throwOnError: false })}>
              Try again
            </TailTagButton>
          </View>
        ) : suitEntries.length === 0 ? (
          <Text style={styles.message}>No suit catches recorded yet.</Text>
        ) : (
          <View style={styles.list}>
            {suitEntries.map((entry, index) => (
              <Pressable
                key={entry.fursuitId}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() =>
                  router.push({ pathname: '/fursuits/[id]', params: { id: entry.fursuitId } })
                }
                accessibilityRole="button"
                accessibilityLabel={`View ${entry.name}'s fursuit profile`}
              >
                <Text style={styles.rank}>#{index + 1}</Text>
                {entry.avatarUrl ? (
                  <Image source={{ uri: entry.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder} />
                )}
                <View style={styles.details}>
                  <Text style={styles.name} numberOfLines={1}>{entry.name}</Text>
                  <Text style={styles.catchLabel} numberOfLines={1}>
                    {formatCatchCount(entry.catchCount)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  rowHighlight: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'rgba(56,189,248,0.12)',
  },
  rowPressed: {
    opacity: 0.7,
  },
  rank: {
    width: 36,
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  details: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  catchLabel: {
    color: 'rgba(203,213,225,0.8)',
    fontSize: 13,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: spacing.md,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: spacing.md,
    backgroundColor: 'rgba(148,163,184,0.2)',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(148,163,184,0.2)',
    marginVertical: spacing.lg,
  },
  message: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  errorRow: {
    gap: spacing.sm,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
  },
});
