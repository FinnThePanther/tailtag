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
  CONVENTION_LEADERBOARD_QUERY_KEY,
  CONVENTION_SUIT_LEADERBOARD_QUERY_KEY,
  createConventionLeaderboardQueryOptions,
  createConventionSuitLeaderboardQueryOptions,
  type LeaderboardEntry,
  type SuitLeaderboardEntry,
} from '../../src/features/leaderboard';
import { useBlockedIds } from '../../src/features/moderation';
import { emitGameplayEvent } from '../../src/features/events';
import { captureNonCriticalError } from '../../src/lib/sentry';
import { getUserVisibleErrorMessage } from '@/lib/userVisibleErrors';
import { colors } from '../../src/theme';
import { getStorageAuthHeaders, getTransformedImageUrl } from '../../src/utils/supabase-image';
import { styles } from '../../src/app-styles/leaderboard/[conventionId].styles';
import {
  REDACTED_FURSUIT_LABEL,
  REDACTED_PLAYER_LABEL,
} from '../../src/features/leaderboard/constants';

const formatCatchCount = (count: number) => (count === 1 ? '1 catch' : `${count} catches`);

export default function FullLeaderboardScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { conventionId, conventionName, section } = useLocalSearchParams<{
    conventionId: string;
    conventionName?: string;
    section?: 'catchers' | 'suits';
  }>();

  const title = (() => {
    const base = conventionName ?? null;
    if (section === 'catchers') return base ? `${base} · Catchers` : 'Catchers';
    if (section === 'suits') return base ? `${base} · Top Fursuits` : 'Top Fursuits';
    return base ? `${base} · Standings` : 'Full Standings';
  })();

  // Emit a leaderboard_refreshed event on mount so daily tasks/achievements
  // count opening either leaderboard section.
  useEffect(() => {
    if (!userId || !conventionId) return;
    void emitGameplayEvent({
      type: 'leaderboard_refreshed',
      conventionId,
      payload: { convention_id: conventionId },
    }).catch((error) => {
      captureNonCriticalError(error, {
        scope: 'leaderboard.view',
        conventionId,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conventionId, userId]);

  const {
    data: leaderboardEntries = [],
    error: leaderboardError,
    isLoading: isLeaderboardLoading,
    refetch: refetchLeaderboard,
  } = useQuery<LeaderboardEntry[], Error>(
    userId
      ? createConventionLeaderboardQueryOptions(userId, conventionId)
      : {
          queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, 'idle'],
          queryFn: async () => [],
          enabled: false,
        },
  );

  const {
    data: suitEntries = [],
    error: suitError,
    isLoading: isSuitLoading,
    refetch: refetchSuits,
  } = useQuery<SuitLeaderboardEntry[], Error>(
    userId
      ? createConventionSuitLeaderboardQueryOptions(userId, conventionId)
      : {
          queryKey: [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, 'idle'],
          queryFn: async () => [],
          enabled: false,
        },
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
    if (urls.length === 0) {
      return;
    }

    const accessToken = session?.access_token ?? null;
    const authenticatedUrls = urls.filter((url) =>
      Boolean(getStorageAuthHeaders(url, accessToken)),
    );
    const publicUrls = urls.filter((url) => !authenticatedUrls.includes(url));

    if (publicUrls.length > 0) {
      void Image.prefetch(publicUrls);
    }

    if (authenticatedUrls.length > 0 && accessToken) {
      void Image.prefetch(authenticatedUrls, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    }
  }, [filteredSuitEntries, session?.access_token]);

  return (
    <View style={styles.wrapper}>
      <ScreenHeader
        title={title}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Players section */}
        {section !== 'suits' && (
          <>
            {section === undefined && <Text style={styles.sectionTitle}>Catchers</Text>}
            {isLeaderboardLoading ? (
              <Text style={styles.message}>Loading…</Text>
            ) : leaderboardError ? (
              <View style={styles.errorRow}>
                <Text style={styles.error}>
                  {getUserVisibleErrorMessage(
                    leaderboardError,
                    "We couldn't load the leaderboard.",
                  )}
                </Text>
                <TailTagButton
                  variant="outline"
                  size="sm"
                  onPress={() => void refetchLeaderboard({ throwOnError: false })}
                >
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
                  const displayName = entry.isRedacted
                    ? REDACTED_PLAYER_LABEL
                    : (entry.username ?? 'Unnamed player');
                  return (
                    <Pressable
                      key={entry.profileId}
                      style={({ pressed }) => [
                        styles.row,
                        isSelf && styles.rowHighlight,
                        entry.isRedacted && styles.rowRedacted,
                        pressed && styles.rowPressed,
                      ]}
                      disabled={entry.isRedacted}
                      accessibilityRole={entry.isRedacted ? undefined : 'button'}
                      accessibilityLabel={
                        entry.isRedacted
                          ? `Restricted catcher standing, rank ${rank}, ${formatCatchCount(entry.catchCount)}`
                          : `View ${displayName}'s profile`
                      }
                      accessibilityState={{ disabled: entry.isRedacted }}
                      onPress={() =>
                        router.push({ pathname: '/profile/[id]', params: { id: entry.profileId } })
                      }
                    >
                      <Text
                        style={styles.rank}
                        numberOfLines={1}
                      >
                        #{rank}
                      </Text>
                      <View style={styles.details}>
                        <Text
                          style={[styles.name, entry.isRedacted && styles.nameRedacted]}
                          numberOfLines={1}
                        >
                          {displayName}
                          {isSelf ? ' · You' : ''}
                        </Text>
                        <Text
                          style={styles.catchLabel}
                          numberOfLines={1}
                        >
                          {formatCatchCount(entry.catchCount)}
                        </Text>
                      </View>
                      {isSelf ? (
                        <Ionicons
                          name="person"
                          size={14}
                          color={colors.primary}
                        />
                      ) : entry.isRedacted ? (
                        <Ionicons
                          name="lock-closed"
                          size={14}
                          color={colors.textSubtle}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        {section === undefined && <View style={styles.divider} />}

        {/* Suits section */}
        {section !== 'catchers' && (
          <>
            {section === undefined && <Text style={styles.sectionTitle}>Top Fursuits</Text>}
            {isSuitLoading ? (
              <Text style={styles.message}>Loading…</Text>
            ) : suitError ? (
              <View style={styles.errorRow}>
                <Text style={styles.error}>
                  {getUserVisibleErrorMessage(suitError, "We couldn't load the suit leaderboard.")}
                </Text>
                <TailTagButton
                  variant="outline"
                  size="sm"
                  onPress={() => void refetchSuits({ throwOnError: false })}
                >
                  Try again
                </TailTagButton>
              </View>
            ) : filteredSuitEntries.length === 0 ? (
              <Text style={styles.message}>No suit catches recorded yet.</Text>
            ) : (
              <View style={styles.list}>
                {filteredSuitEntries.map((entry, index) => {
                  const rank = index + 1;
                  return (
                    <Pressable
                      key={entry.fursuitId}
                      style={({ pressed }) => [
                        styles.row,
                        entry.isRedacted && styles.rowRedacted,
                        pressed && styles.rowPressed,
                      ]}
                      disabled={entry.isRedacted}
                      onPress={() =>
                        router.push({
                          pathname: '/fursuits/[id]',
                          params: { id: entry.fursuitId },
                        })
                      }
                      accessibilityRole={entry.isRedacted ? undefined : 'button'}
                      accessibilityLabel={
                        entry.isRedacted
                          ? `Restricted fursuit standing, rank ${rank}, ${formatCatchCount(entry.catchCount)}`
                          : `View ${entry.name}'s fursuit profile`
                      }
                      accessibilityState={{ disabled: entry.isRedacted }}
                    >
                      <Text
                        style={styles.rank}
                        numberOfLines={1}
                      >
                        #{rank}
                      </Text>
                      <AppAvatar
                        url={entry.avatarUrl}
                        size="xs"
                        fallback="fursuit"
                        style={styles.avatarMargin}
                      />
                      <View style={styles.details}>
                        <Text
                          style={[styles.name, entry.isRedacted && styles.nameRedacted]}
                          numberOfLines={1}
                        >
                          {entry.isRedacted ? REDACTED_FURSUIT_LABEL : entry.name}
                        </Text>
                        <Text
                          style={styles.catchLabel}
                          numberOfLines={1}
                        >
                          {formatCatchCount(entry.catchCount)}
                        </Text>
                      </View>
                      {entry.isRedacted ? (
                        <Ionicons
                          name="lock-closed"
                          size={14}
                          color={colors.textSubtle}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
