import { PixelRatio, Pressable, ScrollView, Text, View } from 'react-native';

import { useEffect } from 'react';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../src/features/auth';
import { AppAvatar } from '../../src/components/ui/AppAvatar';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { TailTagButton } from '../../src/components/ui/TailTagButton';
import {
  createConventionLeaderboardQueryOptions,
  createConventionSuitLeaderboardQueryOptions,
  type LeaderboardEntry,
  type SuitLeaderboardEntry,
} from '../../src/features/leaderboard';
import { useBlockedIds } from '../../src/features/moderation';
import { colors } from '../../src/theme';
import { getTransformedImageUrl } from '../../src/utils/supabase-image';
import { styles } from '../../src/app-styles/leaderboard/[conventionId].styles';

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

  const blockedIds = useBlockedIds(userId);

  const entriesWithCatches = leaderboardEntries.filter(
    (e) => e.catchCount > 0 && !blockedIds.has(e.profileId),
  );
  const filteredSuitEntries = suitEntries.filter(
    (e) => !e.ownerProfileId || !blockedIds.has(e.ownerProfileId),
  );

  useEffect(() => {
    if (!filteredSuitEntries.length) return;
    const pixelSize = Math.round(40 * Math.min(PixelRatio.get(), 3));
    const urls = filteredSuitEntries
      .slice(0, 15)
      .map((e) => getTransformedImageUrl(e.avatarUrl, { width: pixelSize, height: pixelSize }))
      .filter((url): url is string => url !== null);
    if (urls.length > 0) {
      void Image.prefetch(urls);
    }
  }, [filteredSuitEntries]);

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
        ) : filteredSuitEntries.length === 0 ? (
          <Text style={styles.message}>No suit catches recorded yet.</Text>
        ) : (
          <View style={styles.list}>
            {filteredSuitEntries.map((entry, index) => (
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
                <AppAvatar url={entry.avatarUrl} size="xs" fallback="fursuit" style={styles.avatarMargin} />
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
