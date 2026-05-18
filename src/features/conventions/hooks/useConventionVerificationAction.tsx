import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import { useQueryClient } from '@tanstack/react-query';

import {
  ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY,
  PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY,
  verifyAndOptInToConvention,
  type ConventionVerificationErrorCode,
  type ConventionSummary,
  type VerifiedLocation,
} from '@/features/conventions/api/conventions';
import { DAILY_TASKS_QUERY_KEY } from '@/features/daily-tasks';
import {
  CONVENTION_LEADERBOARD_QUERY_KEY,
  CONVENTION_SUIT_LEADERBOARD_QUERY_KEY,
} from '@/features/leaderboard';
import { useLocationPermission } from '@/features/conventions/hooks/useLocationPermission';
import { LocationPermissionModal } from '@/features/conventions/components/LocationPermissionModal';
import { VerificationErrorModal } from '@/features/conventions/components/VerificationErrorModal';
import { captureHandledException, captureHandledMessage, captureSupabaseError } from '@/lib/sentry';

type UseConventionVerificationActionOptions = {
  profileId: string | null | undefined;
  onVerified?: (
    convention: ConventionSummary,
    payload: { verifiedLocation: VerifiedLocation },
  ) => void | Promise<unknown>;
};

const isSupabaseError = (
  error: unknown,
): error is { code?: string; details?: string; hint?: string; message?: string } =>
  typeof error === 'object' &&
  error !== null &&
  ('code' in error || 'details' in error || 'hint' in error);

const verificationErrorMessage = (
  errorCode: ConventionVerificationErrorCode | null,
  fallback: string | null,
) => {
  switch (errorCode) {
    case 'outside_geofence':
      return "TailTag couldn't confirm you're inside the convention area. Move closer to the venue and try again.";
    case 'poor_accuracy':
      return 'Your GPS signal is not accurate enough to verify you. Step outside or move closer to the venue, then try again.';
    case 'rate_limited':
      return "You've tried location verification several times. Wait a bit, then try again on-site.";
    case 'geofence_not_configured':
      return "This convention's location check is not ready yet. Please ask event staff to review the geofence.";
    case 'registration_closed':
      return 'This convention is not open for registration right now.';
    case 'convention_not_found':
      return 'This convention is no longer available.';
    case 'location_required':
      return 'TailTag needs a fresh location check before catching unlocks.';
    default:
      return fallback ?? 'Location verification failed. Please try again.';
  }
};

export function useConventionVerificationAction({
  profileId,
  onVerified,
}: UseConventionVerificationActionOptions) {
  const queryClient = useQueryClient();
  const {
    status,
    requestPermission,
    isLoading: isRequestingPermission,
  } = useLocationPermission(profileId ?? undefined);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [targetConvention, setTargetConvention] = useState<ConventionSummary | null>(null);
  const [isUpdatingConventionAccess, setIsUpdatingConventionAccess] = useState(false);
  const [isVerifyingLocation, setIsVerifyingLocation] = useState(false);

  const refreshConventionAccess = useCallback(
    async (conventionId: string) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY, profileId],
        }),
        queryClient.invalidateQueries({
          queryKey: [ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY, profileId],
        }),
        queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] }),
        queryClient.invalidateQueries({
          queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, conventionId],
        }),
        queryClient.invalidateQueries({
          queryKey: [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, conventionId],
        }),
      ]);
    },
    [profileId, queryClient],
  );

  const verifyConvention = useCallback(
    async (convention: ConventionSummary): Promise<boolean> => {
      setTargetConvention(convention);
      setVerificationError(null);

      if (!profileId) {
        setVerificationError('Unable to verify location without profile.');
        return false;
      }

      if (status !== 'granted') {
        const granted = await requestPermission();
        if (!granted) {
          setShowPermissionModal(true);
          return false;
        }
      }

      setIsVerifyingLocation(true);
      setIsUpdatingConventionAccess(true);
      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 0,
        });

        const { latitude, longitude, accuracy } = position.coords;
        const effectiveAccuracy = typeof accuracy === 'number' ? accuracy : 50;
        const roundedAccuracy = Math.max(1, Math.round(effectiveAccuracy));
        const verifiedLocation = { latitude, longitude, accuracy: roundedAccuracy };

        const result = await verifyAndOptInToConvention({
          profileId,
          conventionId: convention.id,
          verifiedLocation,
        });

        captureHandledMessage('geo_verification_result', {
          conventionId: convention.id,
          verified: result.verified,
          path: 'verify_and_opt_in_to_convention',
          distance_meters: result.distance_meters ?? null,
          radius_meters: result.geofence_radius_meters,
          effective_radius_meters: result.effective_radius_meters ?? null,
          accuracy_meters: roundedAccuracy,
          error_code: result.error_code ?? null,
          error: result.error ?? null,
        });

        if (!result.verified) {
          setVerificationError(verificationErrorMessage(result.error_code, result.error));
          return false;
        }

        try {
          await refreshConventionAccess(convention.id);
          await onVerified?.(convention, { verifiedLocation });
        } catch (caught) {
          if (isSupabaseError(caught)) {
            captureSupabaseError(caught, {
              scope: 'useConventionVerificationAction',
              action: 'refreshConventionAccess',
              additionalContext: { profileId, conventionId: convention.id },
            });
          } else {
            captureHandledException(caught, {
              scope: 'useConventionVerificationAction',
              additionalContext: { profileId, conventionId: convention.id },
            });
          }
        }
        return true;
      } catch (caught) {
        if (isSupabaseError(caught)) {
          captureSupabaseError(caught, {
            scope: 'useConventionVerificationAction',
            action: 'verifyConvention',
            additionalContext: { profileId, conventionId: convention.id },
          });
        } else {
          captureHandledException(caught, {
            scope: 'useConventionVerificationAction',
            additionalContext: { profileId, conventionId: convention.id },
          });
        }
        setVerificationError(
          caught instanceof Error
            ? caught.message
            : 'Location verified, but we could not update your convention access.',
        );
        return false;
      } finally {
        setIsVerifyingLocation(false);
        setIsUpdatingConventionAccess(false);
      }
    },
    [onVerified, profileId, refreshConventionAccess, requestPermission, status],
  );

  const verificationModals = (
    <>
      <LocationPermissionModal
        visible={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
      />
      {targetConvention ? (
        <VerificationErrorModal
          visible={Boolean(verificationError)}
          error={verificationError}
          convention={targetConvention}
          onClose={() => setVerificationError(null)}
          onRetry={() => {
            void verifyConvention(targetConvention);
          }}
        />
      ) : null}
    </>
  );

  return {
    verifyConvention,
    verificationModals,
    isVerifyingConvention:
      isVerifyingLocation || isRequestingPermission || isUpdatingConventionAccess,
  };
}
