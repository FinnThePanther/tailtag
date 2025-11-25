import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { colors, radius, spacing } from '../../../theme';
import type { PendingCatch } from '../types';

type PendingCatchCardProps = {
  pendingCatch: PendingCatch;
  onAccept: () => void;
  onReject: () => void;
  isProcessing?: boolean;
};

function formatTimeRemaining(expiresAt: string): string {
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  const diff = expiry - now;

  if (diff <= 0) {
    return 'Expired';
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h left`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  }

  return `${minutes}m left`;
}

export function PendingCatchCard({
  pendingCatch,
  onAccept,
  onReject,
  isProcessing = false,
}: PendingCatchCardProps) {
  const router = useRouter();
  const [timeDisplay, setTimeDisplay] = useState(() =>
    formatTimeRemaining(pendingCatch.expiresAt)
  );

  // Update countdown every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeDisplay(formatTimeRemaining(pendingCatch.expiresAt));
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [pendingCatch.expiresAt]);

  const isExpired = useMemo(() => {
    return new Date(pendingCatch.expiresAt).getTime() <= Date.now();
  }, [pendingCatch.expiresAt]);

  const handleViewProfile = () => {
    router.push({
      pathname: '/profile/[id]',
      params: { id: pendingCatch.catcherId },
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.catcherInfo}>
          <Pressable onPress={handleViewProfile} style={styles.avatarWrapper}>
            {pendingCatch.catcherAvatarUrl ? (
              <Image
                source={{ uri: pendingCatch.catcherAvatarUrl }}
                style={styles.avatar}
              />
            ) : (
              <Ionicons name="person" size={20} color="rgba(148,163,184,0.7)" />
            )}
          </Pressable>
          <View style={styles.textInfo}>
            <Pressable onPress={handleViewProfile}>
              <Text style={styles.username} numberOfLines={1}>
                {pendingCatch.catcherUsername}
              </Text>
            </Pressable>
            <Text style={styles.subtitle} numberOfLines={1}>
              wants to catch <Text style={styles.fursuitName}>{pendingCatch.fursuitName}</Text>
            </Text>
          </View>
        </View>
        <View style={styles.timeContainer}>
          <Ionicons
            name="time-outline"
            size={14}
            color={isExpired ? '#f87171' : '#fbbf24'}
          />
          <Text style={[styles.timeText, isExpired && styles.expiredText]}>
            {timeDisplay}
          </Text>
        </View>
      </View>

      <View style={styles.contextRow}>
        <Ionicons name="location-outline" size={14} color="rgba(148,163,184,0.8)" />
        <Text style={styles.contextText} numberOfLines={1}>
          {pendingCatch.conventionName}
        </Text>
      </View>

      <View style={styles.actions}>
        <TailTagButton
          variant="outline"
          size="sm"
          onPress={onReject}
          disabled={isProcessing || isExpired}
          style={styles.rejectButton}
        >
          Decline
        </TailTagButton>
        <TailTagButton
          size="sm"
          onPress={onAccept}
          disabled={isProcessing || isExpired}
          loading={isProcessing}
        >
          Approve
        </TailTagButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: '#fbbf24',
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  catcherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  avatarWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,41,59,0.8)',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  textInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  username: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  subtitle: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 13,
    marginTop: 2,
  },
  fursuitName: {
    color: colors.primary,
    fontWeight: '500',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(251,191,36,0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  timeText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '500',
  },
  expiredText: {
    color: '#f87171',
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.md,
  },
  contextText: {
    color: 'rgba(148,163,184,0.8)',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  rejectButton: {
    borderColor: 'rgba(148,163,184,0.3)',
  },
});
