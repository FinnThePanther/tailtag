import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { AppAvatar } from '../../../components/ui/AppAvatar';
import { AppImage } from '../../../components/ui/AppImage';
import { TailTagButton } from '../../../components/ui/TailTagButton';
import { colors } from '../../../theme';
import type { PendingCatch } from '../types';
import { styles } from './PendingCatchCard.styles';

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
  const { width: screenWidth } = useWindowDimensions();
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
          <Pressable onPress={handleViewProfile}>
            <AppAvatar url={pendingCatch.catcherAvatarUrl} size="xs" fallback="user" />
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
            <AppImage
              url={pendingCatch.catchPhotoUrl}
              width={screenWidth}
              height={screenWidth}
              style={styles.catchPhoto}
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
                source={pendingCatch.catchPhotoUrl}
                style={styles.fullscreenPhoto}
                contentFit="contain"
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
