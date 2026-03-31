import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { AppAvatar } from '../../../components/ui/AppAvatar';
import { useAuth } from '../../auth';
import { fetchBlockedUsers, blockedUsersQueryKey } from '../api/blocks';
import { useUnblockUser } from '../hooks/useUnblockUser';
import { TailTagButton } from '../../../components/ui/TailTagButton';
import { colors, spacing, radius } from '../../../theme';
import type { UserBlock } from '../types';

export function BlockedUsersScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const unblockMutation = useUnblockUser();

  const {
    data: blockedUsers = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: blockedUsersQueryKey(userId ?? ''),
    queryFn: () => fetchBlockedUsers(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  const handleUnblock = (block: UserBlock) => {
    const displayName = block.blockedUsername || 'this user';
    Alert.alert(
      `Unblock ${displayName}?`,
      'They will be able to catch your fursuits and appear on leaderboards again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: () => unblockMutation.mutate(block.blockedId),
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: UserBlock }) => (
    <View style={styles.row}>
      <AppAvatar url={item.blockedAvatarUrl} size="xs" fallback="user" />
      <View style={styles.info}>
        <Text style={styles.username} numberOfLines={1}>
          {item.blockedUsername ?? 'Unknown user'}
        </Text>
        <Text style={styles.date}>
          Blocked {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
      <TailTagButton
        variant="outline"
        size="sm"
        onPress={() => handleUnblock(item)}
        loading={unblockMutation.isPending && unblockMutation.variables === item.blockedId}
      >
        Unblock
      </TailTagButton>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>Loading…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Could not load blocked users.</Text>
        <TailTagButton variant="outline" size="sm" onPress={() => refetch()}>
          Try again
        </TailTagButton>
      </View>
    );
  }

  return (
    <FlatList
      data={blockedUsers}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={blockedUsers.length === 0 ? styles.centered : styles.list}
      ListEmptyComponent={
        <Text style={styles.message}>You haven't blocked anyone.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  username: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  date: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
  },
  message: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
});
