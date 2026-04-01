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
import { StaffModerationModal } from '../../src/features/staff-mode/components/StaffModerationModal';
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
  const [selectedPlayer, setSelectedPlayer] = useState<StaffPlayerResult | null>(null);
  const [pendingAction, setPendingAction] = useState<'ban' | 'unban' | null>(null);
  const [reason, setReason] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmittingModeration, setIsSubmittingModeration] = useState(false);
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

  const resetModerationModal = () => {
    setSelectedPlayer(null);
    setPendingAction(null);
    setReason('');
    setModalError(null);
  };

  const closeModerationModal = () => {
    if (isSubmittingModeration) {
      return;
    }

    resetModerationModal();
  };

  const openModerationModal = (player: StaffPlayerResult, action: 'ban' | 'unban') => {
    setSelectedPlayer(player);
    setPendingAction(action);
    setReason('');
    setModalError(null);
  };

  const handleViewProfile = (playerId: string) => {
    router.push({ pathname: '/profile/[id]', params: { id: playerId } });
  };

  const handleModerationSubmit = async () => {
    if (!selectedPlayer || !pendingAction) {
      return;
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      return;
    }

    setIsSubmittingModeration(true);
    setModalError(null);

    try {
      await staffModerate({
        action: pendingAction,
        userId: selectedPlayer.id,
        reason: trimmedReason,
      });

      const nextSuspended = pendingAction === 'ban';
      const successMessage = nextSuspended ? 'Ban applied.' : 'Ban lifted.';

      setLastResult((current) =>
        current?.id === selectedPlayer.id
          ? { ...current, is_suspended: nextSuspended }
          : current
      );

      resetModerationModal();
      await refetch();
      Alert.alert('Done', successMessage);
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error('Moderation action failed');
      setModalError(typedError.message);
      captureHandledException(typedError, {
        scope: pendingAction === 'ban' ? 'staffMode.ban' : 'staffMode.unban',
        moderatedUserId: selectedPlayer.id,
      });
    } finally {
      setIsSubmittingModeration(false);
    }
  };

  return (
    <View style={styles.container}>
      <TailTagCard>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Staff Mode</Text>
            <Text style={styles.title}>On-site tools</Text>
            <Text style={styles.subtitle}>
              Look up players, review status, and open profiles quickly during the event.
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
                renderItem={({ item }) => (
                  <PlayerRow
                    player={item}
                    disabled={isSubmittingModeration}
                    onBan={() => openModerationModal(item, 'ban')}
                    onUnban={() => openModerationModal(item, 'unban')}
                    onViewProfile={() => handleViewProfile(item.id)}
                  />
                )}
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
            <PlayerRow
              player={lastResult}
              disabled={isSubmittingModeration}
              onBan={() => openModerationModal(lastResult, 'ban')}
              onUnban={() => openModerationModal(lastResult, 'unban')}
              onViewProfile={() => handleViewProfile(lastResult.id)}
            />
          </View>
        ) : null}
      </TailTagCard>

      <StaffModerationModal
        visible={Boolean(selectedPlayer && pendingAction)}
        action={pendingAction}
        username={selectedPlayer?.username ?? null}
        reason={reason}
        error={modalError}
        isSubmitting={isSubmittingModeration}
        onChangeReason={setReason}
        onClose={closeModerationModal}
        onSubmit={() => void handleModerationSubmit()}
      />
    </View>
  );
}

type PlayerRowProps = {
  player: StaffPlayerResult;
  disabled?: boolean;
  onBan: () => void;
  onUnban: () => void;
  onViewProfile: () => void;
};

function PlayerRow({ player, disabled = false, onBan, onUnban, onViewProfile }: PlayerRowProps) {
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
          if (index === 0) {
            if (isSuspended) {
              onUnban();
            } else {
              onBan();
            }
          }
          if (index === 1) {
            onViewProfile();
          }
        },
      );
    } else {
      Alert.alert('Actions', undefined, [
        isSuspended ? { text: 'Unban', onPress: onUnban } : { text: 'Ban', style: 'destructive' as const, onPress: onBan },
        { text: 'View profile', onPress: onViewProfile },
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
        disabled={disabled}
        style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.5 }]}
      >
        <Ionicons name="ellipsis-vertical" size={18} color={colors.foreground} />
      </Pressable>
    </View>
  );
}
