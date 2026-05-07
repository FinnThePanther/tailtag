import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

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
  createConventionSuitRosterQueryOptions,
  type ConventionSuitRosterEntry,
} from '../../../src/features/conventions';
import { supabase } from '../../../src/lib/supabase';
import { colors } from '../../../src/theme';
import { styles } from '../../../src/app-styles/conventions/roster.styles';

type RosterFilter = 'all' | 'not-caught' | 'caught';

const formatCount = (count: number, singular: string, plural = `${singular}s`) =>
  count === 1 ? `1 ${singular}` : `${count} ${plural}`;

const colorLine = (entry: ConventionSuitRosterEntry) =>
  entry.colors.map((color) => color.name).join(', ');

const buildSearchText = (entry: ConventionSuitRosterEntry) =>
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
    data: rosterEntries = [],
    error,
    isLoading,
    refetch,
  } = useQuery<ConventionSuitRosterEntry[], Error>(
    conventionId && userId
      ? createConventionSuitRosterQueryOptions(userId, conventionId)
      : {
          queryKey: [CONVENTION_SUIT_ROSTER_QUERY_KEY, userId ?? 'guest', 'idle'],
          queryFn: async () => [],
          enabled: false,
        },
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
        invalidateRoster,
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
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(blockChannel);
    };
  }, [conventionId, queryClient, userId]);

  const counts = useMemo(() => {
    const caught = rosterEntries.filter((entry) => entry.caughtByCurrentUser).length;
    const catchable = rosterEntries.filter((entry) => entry.catchableNow).length;

    return {
      all: rosterEntries.length,
      notCaught: rosterEntries.length - caught,
      caught,
      catchable,
    };
  }, [rosterEntries]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = searchInput.trim().toLowerCase();

    return rosterEntries
      .filter((entry) => {
        if (activeFilter === 'not-caught' && entry.caughtByCurrentUser) return false;
        if (activeFilter === 'caught' && !entry.caughtByCurrentUser) return false;
        if (!normalizedSearch) return true;
        return buildSearchText(entry).includes(normalizedSearch);
      })
      .sort((a, b) => {
        const catchableDiff = Number(b.catchableNow) - Number(a.catchableNow);
        if (catchableDiff !== 0) return catchableDiff;

        const notCaughtDiff = Number(!b.caughtByCurrentUser) - Number(!a.caughtByCurrentUser);
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

  const title = conventionName ? `${conventionName} Suiter Roster` : 'Suiter Roster';

  return (
    <View style={styles.wrapper}>
      <ScreenHeader
        title={title}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.container}>
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
          <View style={styles.summaryPill}>
            <Text style={styles.summaryValue}>{counts.catchable}</Text>
            <Text style={styles.summaryLabel}>Catchable</Text>
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
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isLoading ? (
          <Text style={styles.message}>Loading roster…</Text>
        ) : error ? (
          <View style={styles.errorBlock}>
            <Text style={styles.error}>{error.message}</Text>
            <TailTagButton
              variant="outline"
              size="sm"
              onPress={() => void refetch({ throwOnError: false })}
            >
              Try again
            </TailTagButton>
          </View>
        ) : filteredEntries.length === 0 ? (
          <Text style={styles.message}>{emptyMessage}</Text>
        ) : (
          <View style={styles.list}>
            {filteredEntries.map((entry) => {
              const colorsText = colorLine(entry);
              const metaParts = [entry.species, colorsText].filter(Boolean);
              const ownerText = entry.ownerUsername ? `@${entry.ownerUsername}` : 'Unnamed player';

              return (
                <Pressable
                  key={entry.fursuitId}
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
                      {entry.catchableNow ? (
                        <View style={[styles.badge, styles.badgePrimary]}>
                          <Text style={[styles.badgeText, styles.badgeTextPrimary]}>
                            Catchable now
                          </Text>
                        </View>
                      ) : null}
                      {entry.caughtByCurrentUser ? (
                        <View style={[styles.badge, styles.badgeSuccess]}>
                          <Text style={[styles.badgeText, styles.badgeTextSuccess]}>Caught</Text>
                        </View>
                      ) : (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>Not caught</Text>
                        </View>
                      )}
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {formatCount(entry.conventionCatchCount, 'catch', 'catches')}
                        </Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
