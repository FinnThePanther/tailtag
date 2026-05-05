import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useState } from 'react';

import type {
  ConventionMembershipState,
  ConventionSummary,
  VerifiedLocation,
} from '../../features/conventions';
import { formatConventionDateRange, isConventionEnded } from '../../features/conventions/utils';
import { useLocationPermission } from '@/features/conventions/hooks/useLocationPermission';
import { useGeoVerification } from '@/features/conventions/hooks/useGeoVerification';
import { LocationPermissionModal } from '@/features/conventions/components/LocationPermissionModal';
import { VerificationErrorModal } from '@/features/conventions/components/VerificationErrorModal';
import { colors } from '../../theme';
import { styles } from './ConventionToggle.styles';

export type ConventionToggleProps = {
  convention: ConventionSummary;
  selected: boolean;
  pending: boolean;
  disabled?: boolean;
  badgeText?: string;
  membershipState?: ConventionMembershipState | null;
  profileId?: string;
  onToggle: (
    conventionId: string,
    nextSelected: boolean,
    verifiedLocation?: VerifiedLocation | null,
  ) => void;
};

export function ConventionToggle({
  convention,
  selected,
  pending,
  disabled = false,
  badgeText,
  membershipState,
  profileId,
  onToggle,
}: ConventionToggleProps) {
  const requiresVerification =
    Boolean(profileId) &&
    convention.is_joinable === true &&
    Boolean(convention.location_verification_required) &&
    Boolean(convention.geofence_enabled);
  const {
    status,
    requestPermission,
    isLoading: isRequestingPermission,
  } = useLocationPermission(profileId);
  const { verifyLocation, isVerifying } = useGeoVerification();
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const dateRange = formatConventionDateRange(
    convention.start_date ?? null,
    convention.end_date ?? null,
  );
  const hasEnded = isConventionEnded(convention.end_date ?? null);
  const isDisabledDueToEnd = hasEnded && !selected; // Allow deselecting even if ended
  const shouldDisable =
    disabled || pending || isVerifying || isRequestingPermission || isDisabledDueToEnd;
  const showDisabledBadge = !selected && !pending && (disabled || hasEnded);
  const defaultBadgeText =
    badgeText ??
    (membershipState === 'active'
      ? 'Ready to catch'
      : membershipState === 'needs_location_verification'
        ? 'Verify location'
        : membershipState === 'awaiting_start'
          ? 'Waiting for staff start'
          : membershipState === 'upcoming'
            ? 'Joined'
            : selected
              ? 'Joined'
              : convention.is_joinable
                ? 'Tap to join'
                : 'Add to yours');

  const handlePress = async () => {
    const shouldVerifySelectedConvention =
      selected && membershipState === 'needs_location_verification' && requiresVerification;

    // Opt-out: no verification required unless the row is explicitly asking for verification.
    if (selected && !shouldVerifySelectedConvention) {
      onToggle(convention.id, false, null);
      return;
    }

    // No verification required -> toggle immediately
    if (!requiresVerification) {
      onToggle(convention.id, true, null);
      return;
    }

    // Ensure permission
    if (status !== 'granted') {
      const granted = await requestPermission();
      if (!granted) {
        setShowPermissionModal(true);
        return;
      }
    }

    // Verify location
    if (!profileId) {
      setVerificationError('Unable to verify location without profile.');
      return;
    }

    const result = await verifyLocation(convention.id, profileId);
    if (result.verified) {
      onToggle(convention.id, true, result.location);
    } else {
      setVerificationError(result.error ?? 'Location verification failed.');
    }
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: shouldDisable, selected }}
        onPress={handlePress}
        disabled={shouldDisable}
        style={({ pressed }) => [
          styles.conventionRow,
          selected && styles.conventionRowSelected,
          shouldDisable && styles.conventionRowDisabled,
          pressed && !shouldDisable ? styles.conventionRowPressed : null,
        ]}
      >
        <View style={styles.conventionInfo}>
          <View style={styles.conventionNameRow}>
            <Text style={styles.conventionName}>{convention.name}</Text>
            {hasEnded ? <Text style={styles.endedBadge}>(Ended)</Text> : null}
          </View>
          {convention.location ? (
            <Text style={styles.conventionMetaText}>{convention.location}</Text>
          ) : null}
          {dateRange ? <Text style={styles.conventionMetaText}>{dateRange}</Text> : null}
          {requiresVerification ? (
            <Text style={styles.verificationText}>Location required</Text>
          ) : null}
        </View>
        <View
          style={[
            styles.conventionBadge,
            selected && styles.conventionBadgeActive,
            showDisabledBadge ? styles.conventionBadgeDisabled : null,
          ]}
        >
          {pending || isVerifying ? (
            <ActivityIndicator
              size="small"
              color={colors.foreground}
            />
          ) : (
            <Text
              numberOfLines={1}
              style={styles.conventionBadgeText}
            >
              {defaultBadgeText}
            </Text>
          )}
        </View>
      </Pressable>

      <LocationPermissionModal
        visible={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
      />
      <VerificationErrorModal
        visible={Boolean(verificationError)}
        error={verificationError}
        convention={convention}
        onClose={() => setVerificationError(null)}
        onRetry={() => {
          setVerificationError(null);
          void handlePress();
        }}
      />
    </>
  );
}
