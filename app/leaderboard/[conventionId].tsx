import { FlatList, InteractionManager, PixelRatio, Pressable, Text, View } from 'react-native';

import { useCallback, useEffect, useMemo } from 'react';
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
  LeaderboardSectionSkeleton,
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
const formatCaughtTimes = (count: number) =>
  count === 1 ? 'Caught 1 time' : `Caught ${count} times`;

type LeaderboardListItem =
  | { id: string; type: 'section-title'; title: string }
  | { id: string; type: 'divider' }
  | { id: string; type: 'skeleton' }
  | { id: string; type: 'catcher-error' }
  | { id: string; type: 'suit-error' }
  | { id: string; type: 'message'; message: string }
  | { id: string; type: 'catcher'; entry: LeaderboardEntry; rank: number }
  | { id: string; type: 'suit'; entry: SuitLeaderboardEntry; rank: number };

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

  const shouldLoadCatchers = Boolean(userId) && section !== 'suits';
  const shouldLoadSuits = Boolean(userId) && section !== 'catchers';

  const {
    data: leaderboardEntries = [],
    error: leaderboardError,
    isLoading: isLeaderboardLoading,
    refetch: refetchLeaderboard,
  } = useQuery<LeaderboardEntry[], Error>(
    userId
      ? {
          ...createConventionLeaderboardQueryOptions(userId, conventionId),
          enabled: shouldLoadCatchers,
        }
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
      ? {
          ...createConventionSuitLeaderboardQueryOptions(userId, conventionId),
          enabled: shouldLoadSuits,
        }
      : {
          queryKey: [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, 'idle'],
          queryFn: async () => [],
          enabled: false,
        },
  );

  const blockedIds = useBlockedIds(userId);

  const entriesWithCatches = useMemo(
    () => leaderboardEntries.filter((e) => e.catchCount > 0 && !blockedIds.has(e.profileId)),
    [blockedIds, leaderboardEntries],
  );
  const filteredSuitEntries = useMemo(
    () => suitEntries.filter((e) => !e.ownerProfileId || !blockedIds.has(e.ownerProfileId)),
    [blockedIds, suitEntries],
  );

  useEffect(() => {
    if (!filteredSuitEntries.length) return;
    const task = InteractionManager.runAfterInteractions(() => {
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
    });

    return () => {
      task.cancel();
    };
  }, [filteredSuitEntries, session?.access_token]);

  const listItems = useMemo<LeaderboardListItem[]>(() => {
    const items: LeaderboardListItem[] = [];

    if (section !== 'suits') {
      if (section === undefined) {
        items.push({ id: 'catchers-title', type: 'section-title', title: 'Catchers' });
      }
      if (isLeaderboardLoading) {
        items.push({ id: 'catchers-skeleton', type: 'skeleton' });
      } else if (leaderboardError) {
        items.push({ id: 'catchers-error', type: 'catcher-error' });
      } else if (entriesWithCatches.length === 0) {
        items.push({ id: 'catchers-empty', type: 'message', message: 'No catches yet.' });
      } else {
        entriesWithCatches.forEach((entry, index) => {
          items.push({
            id: `catcher-${entry.profileId}`,
            type: 'catcher',
            entry,
            rank: index + 1,
          });
        });
      }
    }

    if (section === undefined) {
      items.push({ id: 'section-divider', type: 'divider' });
    }

    if (section !== 'catchers') {
      if (section === undefined) {
        items.push({ id: 'suits-title', type: 'section-title', title: 'Top Fursuits' });
      }
      if (isSuitLoading) {
        items.push({ id: 'suits-skeleton', type: 'skeleton' });
      } else if (suitError) {
        items.push({ id: 'suits-error', type: 'suit-error' });
      } else if (filteredSuitEntries.length === 0) {
        items.push({
          id: 'suits-empty',
          type: 'message',
          message: 'No suit catches recorded yet.',
        });
      } else {
        filteredSuitEntries.forEach((entry, index) => {
          items.push({
            id: `suit-${entry.fursuitId}`,
            type: 'suit',
            entry,
            rank: index + 1,
          });
        });
      }
    }

    return items;
  }, [
    entriesWithCatches,
    filteredSuitEntries,
    isLeaderboardLoading,
    isSuitLoading,
    leaderboardError,
    section,
    suitError,
  ]);

  const renderListItem = useCallback(
    ({ item }: { item: LeaderboardListItem }) => {
      if (item.type === 'section-title') {
        return <Text style={styles.sectionTitle}>{item.title}</Text>;
      }

      if (item.type === 'divider') {
        return <View style={styles.divider} />;
      }

      if (item.type === 'skeleton') {
        return <LeaderboardSectionSkeleton />;
      }

      if (item.type === 'catcher-error') {
        return (
          <View style={styles.errorRow}>
            <Text style={styles.error}>
              {getUserVisibleErrorMessage(leaderboardError, "We couldn't load the leaderboard.")}
            </Text>
            <TailTagButton
              variant="outline"
              size="sm"
              onPress={() => void refetchLeaderboard({ throwOnError: false })}
            >
              Try again
            </TailTagButton>
          </View>
        );
      }

      if (item.type === 'suit-error') {
        return (
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
        );
      }

      if (item.type === 'message') {
        return <Text style={styles.message}>{item.message}</Text>;
      }

      if (item.type === 'catcher') {
        const isSelf = item.entry.profileId === userId;
        const displayName = item.entry.isRedacted
          ? REDACTED_PLAYER_LABEL
          : (item.entry.username ?? 'Unnamed player');

        return (
          <Pressable
            style={({ pressed }) => [
              styles.row,
              isSelf && styles.rowHighlight,
              item.entry.isRedacted && styles.rowRedacted,
              pressed && styles.rowPressed,
            ]}
            disabled={item.entry.isRedacted}
            accessibilityRole={item.entry.isRedacted ? undefined : 'button'}
            accessibilityLabel={
              item.entry.isRedacted
                ? `Restricted catcher standing, rank ${item.rank}, ${formatCatchCount(item.entry.catchCount)}`
                : `View ${displayName}'s profile`
            }
            accessibilityState={{ disabled: item.entry.isRedacted }}
            onPress={() =>
              router.push({ pathname: '/profile/[id]', params: { id: item.entry.profileId } })
            }
          >
            <Text
              style={styles.rank}
              numberOfLines={1}
            >
              #{item.rank}
            </Text>
            <View style={styles.details}>
              <Text
                style={[styles.name, item.entry.isRedacted && styles.nameRedacted]}
                numberOfLines={1}
              >
                {displayName}
                {isSelf ? ' · You' : ''}
              </Text>
              <Text
                style={styles.catchLabel}
                numberOfLines={1}
              >
                {formatCatchCount(item.entry.catchCount)}
              </Text>
            </View>
            {isSelf ? (
              <Ionicons
                name="person"
                size={14}
                color={colors.primary}
              />
            ) : item.entry.isRedacted ? (
              <Ionicons
                name="lock-closed"
                size={14}
                color={colors.textSubtle}
              />
            ) : null}
          </Pressable>
        );
      }

      return (
        <Pressable
          style={({ pressed }) => [
            styles.row,
            item.entry.isRedacted && styles.rowRedacted,
            pressed && styles.rowPressed,
          ]}
          disabled={item.entry.isRedacted}
          onPress={() =>
            router.push({
              pathname: '/fursuits/[id]',
              params: { id: item.entry.fursuitId },
            })
          }
          accessibilityRole={item.entry.isRedacted ? undefined : 'button'}
          accessibilityLabel={
            item.entry.isRedacted
              ? `Restricted fursuit standing, rank ${item.rank}, ${formatCaughtTimes(item.entry.catchCount)}`
              : `View ${item.entry.name}'s fursuit profile`
          }
          accessibilityState={{ disabled: item.entry.isRedacted }}
        >
          <Text
            style={styles.rank}
            numberOfLines={1}
          >
            #{item.rank}
          </Text>
          <AppAvatar
            url={item.entry.avatarUrl}
            size="xs"
            fallback="fursuit"
            style={styles.avatarMargin}
          />
          <View style={styles.details}>
            <Text
              style={[styles.name, item.entry.isRedacted && styles.nameRedacted]}
              numberOfLines={1}
            >
              {item.entry.isRedacted ? REDACTED_FURSUIT_LABEL : item.entry.name}
            </Text>
            <Text
              style={styles.catchLabel}
              numberOfLines={1}
            >
              {formatCaughtTimes(item.entry.catchCount)}
            </Text>
          </View>
          {item.entry.isRedacted ? (
            <Ionicons
              name="lock-closed"
              size={14}
              color={colors.textSubtle}
            />
          ) : null}
        </Pressable>
      );
    },
    [leaderboardError, refetchLeaderboard, refetchSuits, router, suitError, userId],
  );

  return (
    <View style={styles.wrapper}>
      <ScreenHeader
        title={title}
        onBack={() => router.back()}
      />
      <FlatList
        data={listItems}
        keyExtractor={(item) => item.id}
        renderItem={renderListItem}
        contentContainerStyle={styles.container}
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        initialNumToRender={14}
        maxToRenderPerBatch={12}
        windowSize={7}
      />
    </View>
  );
}
