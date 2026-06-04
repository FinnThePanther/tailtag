import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { AppAvatar } from '../../../src/components/ui/AppAvatar';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { TailTagButton } from '../../../src/components/ui/TailTagButton';
import { TailTagInput } from '../../../src/components/ui/TailTagInput';
import { useAuth } from '../../../src/features/auth';
import {
  CONVENTION_SUIT_ROSTER_QUERY_KEY,
  CONVENTION_SUIT_ROSTER_CAUGHT_IDS_QUERY_KEY,
  createConventionSuitRosterCaughtIdsQueryOptions,
  createConventionSuitRosterQueryOptions,
  type ConventionSuitRosterViewEntry,
} from '../../../src/features/conventions';
import { supabase } from '../../../src/lib/supabase';
import { colors } from '../../../src/theme';
import { styles } from '../../../src/app-styles/conventions/roster.styles';

type RosterFilter = 'all' | 'not-caught' | 'caught';
type RosterDisplayEntry = ConventionSuitRosterViewEntry & {
  isOwnedByCurrentUser: boolean;
};

const formatCount = (count: number, singular: string, plural = `${singular}s`) =>
  count === 1 ? `1 ${singular}` : `${count} ${plural}`;

const colorLine = (entry: RosterDisplayEntry) => entry.colors.map((color) => color.name).join(', ');

const buildSearchText = (entry: RosterDisplayEntry) =>
  [entry.name, entry.species, entry.ownerUsername, ...entry.colors.map((color) => color.name)]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();

export default function ConventionSuitRosterScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { conventionId, conventionName } = useLocalSearchParams<{
    conventionId: string;
    conventionName?: string;
  }>();
  const [searchInput, setSearchInput] = useState('');
  const [activeFilter, setActiveFilter] = useState<RosterFilter>('all');

  const {
    data: rosterMetadataEntries = [],
    error: rosterError,
    isLoading: isRosterLoading,
    refetch: refetchRoster,
  } = useQuery(
    conventionId && userId
      ? createConventionSuitRosterQueryOptions(userId, conventionId)
      : {
          queryKey: [CONVENTION_SUIT_ROSTER_QUERY_KEY, userId ?? 'guest', 'idle'],
          queryFn: async () => [],
          enabled: false,
        },
  );

  const {
    data: caughtFursuitIds = new Set<string>(),
    error: caughtIdsError,
    isLoading: areCaughtIdsLoading,
    refetch: refetchCaughtIds,
  } = useQuery(
    conventionId && userId
      ? createConventionSuitRosterCaughtIdsQueryOptions(userId, conventionId)
      : {
          queryKey: [CONVENTION_SUIT_ROSTER_CAUGHT_IDS_QUERY_KEY, userId ?? 'guest', 'idle'],
          queryFn: async () => new Set<string>(),
          enabled: false,
        },
  );

  const rosterEntries = useMemo<RosterDisplayEntry[]>(
    () =>
      rosterMetadataEntries.map((entry) => ({
        ...entry,
        caughtByCurrentUser: caughtFursuitIds.has(entry.fursuitId),
        isOwnedByCurrentUser: Boolean(userId) && entry.ownerProfileId === userId,
      })),
    [caughtFursuitIds, rosterMetadataEntries, userId],
  );

  useEffect(() => {
    if (!conventionId) return;

    const instanceId = Math.random().toString(36).slice(2, 11);
    const invalidateRoster = () => {
      void queryClient.invalidateQueries({
        queryKey: [CONVENTION_SUIT_ROSTER_QUERY_KEY, userId ?? 'guest', conventionId],
      });
    };

    const rosterChannel = supabase
      .channel(`suiter-roster:${conventionId}:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fursuit_conventions',
          filter: `convention_id=eq.${conventionId}`,
        },
        invalidateRoster,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'catches',
          filter: `convention_id=eq.${conventionId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: [CONVENTION_SUIT_ROSTER_QUERY_KEY, userId, conventionId],
          });
          void queryClient.invalidateQueries({
            queryKey: [CONVENTION_SUIT_ROSTER_CAUGHT_IDS_QUERY_KEY, userId, conventionId],
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(rosterChannel);
    };
  }, [conventionId, queryClient, userId]);

  useEffect(() => {
    if (!userId || !conventionId) return;

    const instanceId = Math.random().toString(36).slice(2, 11);
    const blockChannel = supabase
      .channel(`suiter-roster-blocks:${userId}:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_blocks',
        },
        (payload) => {
          const row = (payload.new ?? payload.old ?? {}) as {
            blocker_id?: string;
            blocked_id?: string;
          };
          if (row.blocker_id === userId || row.blocked_id === userId) {
            void queryClient.invalidateQueries({
              queryKey: [CONVENTION_SUIT_ROSTER_QUERY_KEY, userId, conventionId],
            });
            void queryClient.invalidateQueries({
              queryKey: [CONVENTION_SUIT_ROSTER_CAUGHT_IDS_QUERY_KEY, userId, conventionId],
            });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(blockChannel);
    };
  }, [conventionId, queryClient, userId]);

  const counts = useMemo(() => {
    const catchableEntries = rosterEntries.filter((entry) => !entry.isOwnedByCurrentUser);
    const caught = catchableEntries.filter((entry) => entry.caughtByCurrentUser).length;

    return {
      all: rosterEntries.length,
      notCaught: catchableEntries.length - caught,
      caught,
    };
  }, [rosterEntries]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = searchInput.trim().toLowerCase();

    return rosterEntries
      .filter((entry) => {
        if (activeFilter === 'not-caught') {
          if (entry.isOwnedByCurrentUser || entry.caughtByCurrentUser) return false;
        }
        if (activeFilter === 'caught') {
          if (entry.isOwnedByCurrentUser || !entry.caughtByCurrentUser) return false;
        }
        if (!normalizedSearch) return true;
        return buildSearchText(entry).includes(normalizedSearch);
      })
      .sort((a, b) => {
        const notCaughtDiff =
          Number(!b.isOwnedByCurrentUser && !b.caughtByCurrentUser) -
          Number(!a.isOwnedByCurrentUser && !a.caughtByCurrentUser);
        if (notCaughtDiff !== 0) return notCaughtDiff;

        const nameDiff = a.name.localeCompare(b.name);
        if (nameDiff !== 0) return nameDiff;

        return a.fursuitId.localeCompare(b.fursuitId);
      });
  }, [activeFilter, rosterEntries, searchInput]);

  const emptyMessage = (() => {
    if (rosterEntries.length === 0) return 'No suits are listed for this convention yet.';
    if (searchInput.trim().length > 0) return 'No roster matches.';
    if (activeFilter === 'not-caught') {
      return "You've caught every visible suit on this roster.";
    }
    if (activeFilter === 'caught') return "You haven't caught any visible suits here yet.";
    return 'No roster matches.';
  })();

  const title = conventionName ? `${conventionName} Fursuit Roster` : 'Fursuit Roster';
  const error = rosterError ?? caughtIdsError;
  const isLoading = isRosterLoading || (rosterMetadataEntries.length > 0 && areCaughtIdsLoading);

  const handleRetry = useCallback(() => {
    void refetchRoster({ throwOnError: false });
    void refetchCaughtIds({ throwOnError: false });
  }, [refetchCaughtIds, refetchRoster]);

  const renderRosterEntry = useCallback(
    ({ item: entry }: { item: RosterDisplayEntry }) => {
      const colorsText = colorLine(entry);
      const metaParts = [entry.species, colorsText].filter(Boolean);
      const ownerText = entry.ownerUsername ? `@${entry.ownerUsername}` : 'Unnamed player';
      const statusBadge = entry.isOwnedByCurrentUser ? (
        <View style={[styles.badge, styles.badgeOwn]}>
          <Text style={[styles.badgeText, styles.badgeTextOwn]}>Your Suit</Text>
        </View>
      ) : entry.caughtByCurrentUser ? (
        <View style={[styles.badge, styles.badgeSuccess]}>
          <Text style={[styles.badgeText, styles.badgeTextSuccess]}>Caught</Text>
        </View>
      ) : (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Not caught</Text>
        </View>
      );

      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${entry.name}'s fursuit profile`}
          onPress={() =>
            router.push({
              pathname: '/fursuits/[id]',
              params: { id: entry.fursuitId },
            })
          }
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <AppAvatar
            url={entry.avatarUrl}
            size="md"
            fallback="fursuit"
          />
          <View style={styles.rowDetails}>
            <View style={styles.rowTitleLine}>
              <Text
                style={styles.suitName}
                numberOfLines={1}
              >
                {entry.name}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textMuted}
              />
            </View>
            <Text
              style={styles.meta}
              numberOfLines={1}
            >
              {ownerText}
            </Text>
            {metaParts.length > 0 ? (
              <Text
                style={styles.meta}
                numberOfLines={1}
              >
                {metaParts.join(' · ')}
              </Text>
            ) : null}
            <View style={styles.badgeRow}>
              {statusBadge}
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {formatCount(entry.conventionCatchCount, 'catch', 'catches')}
                </Text>
              </View>
            </View>
          </View>
        </Pressable>
      );
    },
    [router],
  );

  const ListHeader = (
    <View style={styles.headerContent}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryValue}>{counts.all}</Text>
          <Text style={styles.summaryLabel}>All suits</Text>
        </View>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryValue}>{counts.notCaught}</Text>
          <Text style={styles.summaryLabel}>Not caught</Text>
        </View>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryValue}>{counts.caught}</Text>
          <Text style={styles.summaryLabel}>Caught</Text>
        </View>
      </View>

      <TailTagInput
        value={searchInput}
        onChangeText={setSearchInput}
        placeholder="Search suits, players, species, colors"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.searchInput}
      />

      <View style={styles.filterRow}>
        {[
          ['all', `All (${counts.all})`],
          ['not-caught', `Not caught (${counts.notCaught})`],
          ['caught', `Caught (${counts.caught})`],
        ].map(([filter, label]) => {
          const isActive = activeFilter === filter;
          return (
            <Pressable
              key={filter}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              onPress={() => setActiveFilter(filter as RosterFilter)}
              style={({ pressed }) => [
                styles.filterButton,
                isActive && styles.filterButtonActive,
                pressed && styles.filterButtonPressed,
              ]}
            >
              <Text style={[styles.filterText, isActive && styles.filterTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const ListEmpty = isLoading ? (
    <Text style={styles.message}>Loading roster…</Text>
  ) : error ? (
    <View style={styles.errorBlock}>
      <Text style={styles.error}>{error.message}</Text>
      <TailTagButton
        variant="outline"
        size="sm"
        onPress={handleRetry}
      >
        Try again
      </TailTagButton>
    </View>
  ) : (
    <Text style={styles.message}>{emptyMessage}</Text>
  );

  return (
    <View style={styles.wrapper}>
      <ScreenHeader
        title={title}
        onBack={() => router.back()}
      />
      <FlatList
        data={error || isLoading ? [] : filteredEntries}
        keyExtractor={(entry) => entry.fursuitId}
        renderItem={renderRosterEntry}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}
