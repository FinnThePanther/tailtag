import { useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Platform, Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { TailTagInput } from '../../src/components/ui/TailTagInput';
import { STAFF_MODE_ENABLED } from '../../src/constants/features';
import { useAuth } from '../../src/features/auth';
import { profileQueryKey, fetchProfile } from '../../src/features/profile';
import { searchPlayersForStaff, staffModerate, type StaffPlayerResult } from '../../src/features/staff-mode/api';
import { canUseStaffMode } from '../../src/features/staff-mode/constants';
import { captureHandledException } from '../../src/lib/sentry';
import { colors } from '../../src/theme';
import { styles } from '../../src/app-styles/staff-mode/index.styles';

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
  const router = useRouter();
  const [isActing, setIsActing] = useState(false);

  const handleBan = () => {
    Alert.prompt(
      `Ban ${player.username ?? 'user'}`,
      'Enter a reason for the ban:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ban',
          style: 'destructive',
          onPress: (reason?: string) => {
            if (!reason?.trim()) return;
            setIsActing(true);
            staffModerate({ action: 'ban', userId: player.id, reason: reason.trim() })
              .then(() => Alert.alert('Done', 'Ban applied.'))
              .catch((e: Error) => {
                captureHandledException(e, { scope: 'staffMode.ban' });
                Alert.alert('Error', e.message);
              })
              .finally(() => setIsActing(false));
          },
        },
      ],
      'plain-text',
    );
  };

  const handleUnban = () => {
    Alert.prompt(
      `Unban ${player.username ?? 'user'}`,
      'Enter a reason for lifting the ban:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unban',
          onPress: (reason?: string) => {
            if (!reason?.trim()) return;
            setIsActing(true);
            staffModerate({ action: 'unban', userId: player.id, reason: reason.trim() })
              .then(() => Alert.alert('Done', 'Ban lifted.'))
              .catch((e: Error) => {
                captureHandledException(e, { scope: 'staffMode.unban' });
                Alert.alert('Error', e.message);
              })
              .finally(() => setIsActing(false));
          },
        },
      ],
      'plain-text',
    );
  };

  const showActions = () => {
    const isSuspended = player.is_suspended;
    const options = isSuspended
      ? ['Unban', 'View profile', 'Cancel']
      : ['Ban', 'View profile', 'Cancel'];
    const destructiveButtonIndex = isSuspended ? -1 : 0;
    const cancelButtonIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex, cancelButtonIndex },
        (index) => {
          if (index === 0) { if (isSuspended) { handleUnban(); } else { handleBan(); } }
          if (index === 1) router.push({ pathname: '/profile/[id]', params: { id: player.id } });
        },
      );
    } else {
      Alert.alert('Actions', undefined, [
        isSuspended
          ? { text: 'Unban', onPress: handleUnban }
          : { text: 'Ban', style: 'destructive' as const, onPress: handleBan },
        { text: 'View profile', onPress: () => router.push({ pathname: '/profile/[id]', params: { id: player.id } }) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

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
      <Pressable
        onPress={showActions}
        hitSlop={8}
        disabled={isActing}
        style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.5 }]}
      >
        <Ionicons name="ellipsis-vertical" size={18} color={colors.foreground} />
      </Pressable>
    </View>
  );
}
