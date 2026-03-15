import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const fadeAnimRef = useRef(new Animated.Value(1));
  const scaleAnimRef = useRef(new Animated.Value(1));
  const [animatingSuccess, setAnimatingSuccess] = useState(false);
  const [photoFullscreen, setPhotoFullscreen] = useState(false);

  // Trigger success animation when processing completes
  useEffect(() => {
    if (!isProcessing && animatingSuccess) {
      // Animate out: fade + scale down
      Animated.parallel([
        Animated.timing(fadeAnimRef.current, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnimRef.current, {
          toValue: 0.8,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isProcessing, animatingSuccess]);

  // Update countdown every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeDisplay(formatTimeRemaining(pendingCatch.expiresAt));
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [pendingCatch.expiresAt]);

  const isExpired = useMemo(() => {
    return timeDisplay === 'Expired';
  }, [timeDisplay]);

  const handleViewProfile = () => {
    router.push({
      pathname: '/profile/[id]',
      params: { id: pendingCatch.catcherId },
    });
  };

  const handleAccept = () => {
    setAnimatingSuccess(true);
    onAccept();
  };

  const handleReject = () => {
    setAnimatingSuccess(true);
    onReject();
  };

  const containerStyle = useMemo(
    () => [
      styles.container,
      isExpired && styles.expiredContainer,
      {
        opacity: fadeAnimRef.current,
        transform: [{ scale: scaleAnimRef.current }],
      },
    ],
    [isExpired, fadeAnimRef, scaleAnimRef],
  );

  return (
    <Animated.View
      style={containerStyle}
    >
      {isExpired && (
        <View style={styles.expiredOverlay}>
          <Text style={styles.expiredTitle}>This request has expired</Text>
          <Text style={styles.expiredSubtitle}>Ask them to scan your code again</Text>
        </View>
      )}
      <View style={styles.header}>
        <View style={styles.catcherInfo}>
          <Pressable onPress={handleViewProfile} style={styles.avatarWrapper}>
            {pendingCatch.catcherAvatarUrl ? (
              <Image
                source={{ uri: pendingCatch.catcherAvatarUrl }}
                style={styles.avatarImage}
                resizeMode="cover"
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
          </View>
        </View>
        <View
          style={styles.timeContainer}
          accessibilityLabel={isExpired ? 'This catch request has expired' : `Expires in ${timeDisplay}`}
          accessibilityRole="text"
        >
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

      {pendingCatch.catchPhotoUrl ? (
        <>
          <Pressable
            onPress={() => setPhotoFullscreen(true)}
            accessibilityLabel="Tap to view catch photo fullscreen"
            accessibilityRole="button"
          >
            <Image
              source={{ uri: pendingCatch.catchPhotoUrl }}
              style={styles.catchPhoto}
              resizeMode="cover"
              accessibilityLabel="Selfie taken by catcher"
            />
          </Pressable>
          <Modal
            visible={photoFullscreen}
            transparent
            animationType="fade"
            onRequestClose={() => setPhotoFullscreen(false)}
          >
            <Pressable
              style={styles.fullscreenBackdrop}
              onPress={() => setPhotoFullscreen(false)}
            >
              <Image
                source={{ uri: pendingCatch.catchPhotoUrl }}
                style={styles.fullscreenPhoto}
                resizeMode="contain"
                accessibilityLabel="Catch photo fullscreen view"
              />
              <Pressable
                style={styles.closeButton}
                onPress={() => setPhotoFullscreen(false)}
                accessibilityLabel="Close fullscreen photo"
                accessibilityRole="button"
              >
                <Ionicons name="close" size={28} color="#fff" />
              </Pressable>
            </Pressable>
          </Modal>
        </>
      ) : null}

      <View style={styles.contextContainer}>
        <View style={styles.contextRow}>
          <Ionicons name="paw-outline" size={14} color={colors.primary} />
          <Text style={styles.fursuitContextText} numberOfLines={1}>
            {pendingCatch.fursuitName}
          </Text>
        </View>
        <View style={styles.contextRow}>
          <Ionicons name="location-outline" size={14} color="rgba(148,163,184,0.8)" />
          <Text style={styles.contextText} numberOfLines={1}>
            {pendingCatch.conventionName}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TailTagButton
          variant="outline"
          size="sm"
          onPress={handleReject}
          disabled={isProcessing || isExpired}
          style={styles.rejectButton}
          accessibilityLabel={`Decline catch request from ${pendingCatch.catcherUsername} for ${pendingCatch.fursuitName}`}
          accessibilityHint="Double tap to reject this catch request"
        >
          Decline
        </TailTagButton>
        <TailTagButton
          size="sm"
          onPress={handleAccept}
          disabled={isProcessing || isExpired}
          loading={isProcessing}
          accessibilityLabel={`Approve catch request from ${pendingCatch.catcherUsername} for ${pendingCatch.fursuitName}`}
          accessibilityHint="Double tap to accept this catch request"
        >
          Approve
        </TailTagButton>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: '#fbbf24',
    padding: spacing.md,
    position: 'relative',
  },
  expiredContainer: {
    borderColor: '#f87171',
    opacity: 0.7,
  },
  expiredOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 10,
  },
  expiredTitle: {
    color: '#f87171',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  expiredSubtitle: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 13,
    textAlign: 'center',
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
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
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
  catchPhoto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: 'rgba(30,41,59,0.8)',
  },
  contextContainer: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fursuitContextText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '500',
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
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenPhoto: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
