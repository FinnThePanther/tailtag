import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import { useQueryClient } from '@tanstack/react-query';

import {
  ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY,
  PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY,
  verifyAndOptInToConvention,
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
import { normalizeAccuracy, verificationErrorMessage } from '@/features/conventions/utils';
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
      // Optimistically add to active conventions so the UI stays stable
      // while background refetches populate fresh data.
      const activeKey = [ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY, profileId];
      queryClient.setQueryData<string[]>(activeKey, (prev) => {
        if (!prev) return prev;
        if (prev.includes(conventionId)) return prev;
        return [...prev, conventionId];
      });

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY, profileId],
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
        // Fast-path: try recently-cached GPS position first.
        const cached = await Location.getLastKnownPositionAsync({
          maxAge: 30000,
          requiredAccuracy: 100,
        });

        if (cached) {
          const { latitude: clat, longitude: clng, accuracy: cacc } = cached.coords;
          const cRounded = normalizeAccuracy(cacc);
          const testLocation: VerifiedLocation = {
            latitude: clat,
            longitude: clng,
            accuracy: cRounded,
          };

          const fastResult = await verifyAndOptInToConvention({
            profileId,
            conventionId: convention.id,
            verifiedLocation: testLocation,
          });

          captureHandledMessage('geo_verification_result', {
            conventionId: convention.id,
            verified: fastResult.verified,
            path: 'verify_and_opt_in_to_convention',
            distance_meters: fastResult.distance_meters ?? null,
            radius_meters: fastResult.geofence_radius_meters,
            effective_radius_meters: fastResult.effective_radius_meters ?? null,
            accuracy_meters: cRounded,
            error_code: fastResult.error_code ?? null,
            error: fastResult.error ?? null,
          });

          if (fastResult.verified) {
            try {
              await refreshConventionAccess(convention.id);
              await onVerified?.(convention, { verifiedLocation: testLocation });
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
          }

          // Cached position didn't verify — surface the failure directly
          // instead of falling through to live GPS at the same location.
          setVerificationError(verificationErrorMessage(fastResult.error_code, fastResult.error));
          return false;
        }

        // Fallback: live GPS acquisition with a hard timeout.
        const GPS_TIMEOUT_MS = 15_000;
        const positionPromise = Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 0,
        });
        const position = await Promise.race([
          positionPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), GPS_TIMEOUT_MS)),
        ]);

        if (!position) {
          setVerificationError(
            'GPS took too long to get your location. Move to an open area and try again.',
          );
          return false;
        }

        const { latitude, longitude, accuracy } = position.coords;
        const roundedAccuracy = normalizeAccuracy(accuracy);
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
