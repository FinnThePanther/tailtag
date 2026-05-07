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
  onVerifyLocation?: (convention: ConventionSummary) => Promise<boolean> | boolean;
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
  onVerifyLocation,
  onToggle,
}: ConventionToggleProps) {
  const hasLocationGate =
    Boolean(profileId) &&
    Boolean(convention.location_verification_required) &&
    Boolean(convention.geofence_enabled);
  const requiresLiveVerification = hasLocationGate && convention.is_joinable === true;
  const willRequireVerificationLater = hasLocationGate && convention.is_joinable !== true;
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
  const shouldVerifySelectedConvention =
    selected && membershipState === 'needs_location_verification' && hasLocationGate;
  const defaultBadgeText =
    badgeText ??
    (membershipState === 'active'
      ? 'Ready to catch'
      : membershipState === 'needs_location_verification'
        ? 'Verify location'
        : membershipState === 'awaiting_start'
          ? 'Waiting for staff start'
          : membershipState === 'upcoming'
            ? 'Attending'
            : selected
              ? 'Attending'
              : 'Attend');

  const handlePress = async () => {
    // Opt-out: no verification required unless the row is explicitly asking for verification.
    if (selected && !shouldVerifySelectedConvention) {
      onToggle(convention.id, false, null);
      return;
    }

    // No verification required -> toggle immediately
    if (!requiresLiveVerification && !shouldVerifySelectedConvention) {
      onToggle(convention.id, true, null);
      return;
    }

    if (onVerifyLocation) {
      const verified = await onVerifyLocation(convention);
      if (verified && !selected) {
        return;
      }
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
          {requiresLiveVerification || shouldVerifySelectedConvention ? (
            <Text style={styles.verificationText}>Location required</Text>
          ) : willRequireVerificationLater ? (
            <Text style={styles.verificationText}>Location check when catching opens</Text>
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
