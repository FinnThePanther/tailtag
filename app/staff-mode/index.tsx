import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { TailTagInput } from '../../src/components/ui/TailTagInput';
import { STAFF_MODE_ENABLED } from '../../src/constants/features';
import { useAuth } from '../../src/features/auth';
import { profileQueryKey, fetchProfile } from '../../src/features/profile';
import { searchPlayersForStaff, type StaffPlayerResult } from '../../src/features/staff-mode/api';
import { canUseStaffMode } from '../../src/features/staff-mode/constants';
import { colors, spacing, radius } from '../../src/theme';

export default function StaffModeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const {
    data: profile,
    isLoading: isProfileLoading,
    error: profileError,
  } = useQuery({
    queryKey: profileQueryKey(userId ?? ''),
    enabled: Boolean(userId),
    queryFn: () => fetchProfile(userId!),
    staleTime: 60_000,
  });

  const staffAllowed = STAFF_MODE_ENABLED && canUseStaffMode(profile?.role ?? null);

  const [search, setSearch] = useState('');
  const [lastResult, setLastResult] = useState<StaffPlayerResult | null>(null);
  const { data: results = [], isFetching, error: searchError, refetch } = useQuery({
    queryKey: ['staff-mode-search', search],
    enabled: staffAllowed && search.trim().length > 2,
    queryFn: () => searchPlayersForStaff(search),
  });

  useEffect(() => {
    setLastResult((current) => {
      if (results.length > 0) {
        return results[0];
      }
      return current;
    });
  }, [results]);

  const statusMessage = useMemo(() => {
    if (!STAFF_MODE_ENABLED) return 'Staff Mode is disabled in this build.';
    if (isProfileLoading) return 'Loading your role…';
    if (!staffAllowed) return 'You need organizer, staff, or owner access for Staff Mode.';
    return null;
  }, [isProfileLoading, staffAllowed]);

  return (
    <View style={styles.container}>
      <TailTagCard>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Staff Mode</Text>
            <Text style={styles.title}>On-site tools</Text>
            <Text style={styles.subtitle}>
              Search players fast. NFC/QR scan routes here once hardware is ready.
            </Text>
          </View>
          <TailTagButton variant="ghost" size="sm" onPress={() => router.back()}>
            Back
          </TailTagButton>
        </View>

        {statusMessage ? <Text style={styles.message}>{statusMessage}</Text> : null}
        {profileError ? <Text style={styles.error}>{profileError.message}</Text> : null}

        {staffAllowed ? (
          <View style={styles.searchSection}>
            <Text style={styles.sectionTitle}>Lookup</Text>
            <TailTagInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by handle or email"
            />
            <View style={styles.helperRow}>
              <Text style={styles.helperText}>Min 3 characters to search</Text>
              <TailTagButton variant="outline" size="sm" onPress={() => refetch()} loading={isFetching}>
                Refresh
              </TailTagButton>
            </View>
            {searchError ? <Text style={styles.error}>{searchError.message}</Text> : null}
          </View>
        ) : null}

        {staffAllowed ? (
          <View style={styles.resultsSection}>
            {isFetching ? (
              <Text style={styles.message}>Searching…</Text>
            ) : results.length === 0 ? (
              <Text style={styles.message}>No results yet.</Text>
            ) : (
              <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                renderItem={({ item }) => <PlayerRow player={item} />}
              />
            )}
          </View>
        ) : null}

        {staffAllowed && lastResult ? (
          <View style={styles.lastSection}>
            <View style={styles.headerRow}>
              <Text style={styles.sectionTitle}>Last lookup</Text>
              <TailTagButton variant="ghost" size="sm" onPress={() => setSearch(lastResult.username ?? '')}>
                Search again
              </TailTagButton>
            </View>
            <PlayerRow player={lastResult} />
          </View>
        ) : null}
      </TailTagCard>
    </View>
  );
}

function PlayerRow({ player }: { player: StaffPlayerResult }) {
  return (
    <View style={styles.resultRow}>
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarInitial}>{(player.username ?? '?').slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.resultMeta}>
        <Text style={styles.resultName}>{player.username ?? 'Unknown'}</Text>
        <Text style={styles.resultSub}>{player.email ?? 'No email'}</Text>
        <Text style={styles.resultSub}>
          Role: {player.role} • Catches: {player.catch_count} • Fursuits: {player.fursuit_count}
        </Text>
      </View>
      <View style={[styles.statusPill, player.is_suspended ? styles.statusBad : styles.statusGood]}>
        <Text style={styles.statusText}>{player.is_suspended ? 'Suspended' : 'Active'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  eyebrow: {
    color: colors.primary,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  title: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(226,232,240,0.85)',
    fontSize: 14,
  },
  message: {
    color: 'rgba(148,163,184,0.95)',
    fontSize: 14,
    marginTop: spacing.sm,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
    marginTop: spacing.sm,
  },
  searchSection: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  helperText: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
  },
  resultsSection: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(15,23,42,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 16,
  },
  resultMeta: {
    flex: 1,
    gap: 2,
  },
  resultName: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  resultSub: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
  },
  statusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
  },
  statusGood: {
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  statusBad: {
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  statusText: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '700',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(148,163,184,0.2)',
    marginVertical: spacing.sm,
  },
  lastSection: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
