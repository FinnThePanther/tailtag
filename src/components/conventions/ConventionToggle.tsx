import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import type { ConventionSummary, VerifiedLocation } from '../../features/conventions';
import { formatConventionDateRange } from '../../features/conventions/utils';
import { useLocationPermission } from '@/features/conventions/hooks/useLocationPermission';
import { useGeoVerification } from '@/features/conventions/hooks/useGeoVerification';
import { LocationPermissionModal } from '@/features/conventions/components/LocationPermissionModal';
import { VerificationErrorModal } from '@/features/conventions/components/VerificationErrorModal';
import { colors, spacing, radius } from '../../theme';

export type ConventionToggleProps = {
  convention: ConventionSummary;
  selected: boolean;
  pending: boolean;
  disabled?: boolean;
  badgeText?: string;
  profileId?: string;
  onToggle: (conventionId: string, nextSelected: boolean, verifiedLocation?: VerifiedLocation | null) => void;
};

export function ConventionToggle({
  convention,
  selected,
  pending,
  disabled = false,
  badgeText,
  profileId,
  onToggle,
}: ConventionToggleProps) {
  const requiresVerification =
    Boolean(profileId) &&
    Boolean(convention.location_verification_required) &&
    Boolean(convention.geofence_enabled);
  const { status, requestPermission, isLoading: isRequestingPermission } = useLocationPermission(profileId);
  const { verifyLocation, isVerifying } = useGeoVerification();
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const dateRange = formatConventionDateRange(convention.start_date ?? null, convention.end_date ?? null);
  const shouldDisable = disabled || pending || isVerifying || isRequestingPermission;
  const showDisabledBadge = !selected && !pending && disabled;

  const handlePress = async () => {
    // Opt-out: no verification required
    if (selected) {
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
          <Text style={styles.conventionName}>{convention.name}</Text>
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
            <ActivityIndicator size="small" color={colors.foreground} />
          ) : (
            <Text numberOfLines={1} style={styles.conventionBadgeText}>
              {badgeText ?? (selected ? 'Assigned' : 'Tap to assign')}
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

const styles = StyleSheet.create({
  conventionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    backgroundColor: 'rgba(15,23,42,0.7)',
    gap: spacing.md,
  },
  conventionRowSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(56,189,248,0.12)',
  },
  conventionRowDisabled: {
    opacity: 0.6,
  },
  conventionRowPressed: {
    opacity: 0.9,
  },
  conventionInfo: {
    flex: 1,
    gap: 2,
  },
  conventionName: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  conventionMetaText: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 13,
  },
  verificationText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  conventionBadge: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: 'rgba(30,41,59,0.8)',
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  conventionBadgeActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(56,189,248,0.15)',
  },
  conventionBadgeDisabled: {
    borderColor: 'rgba(148,163,184,0.4)',
    backgroundColor: 'rgba(15,23,42,0.5)',
  },
  conventionBadgeText: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
