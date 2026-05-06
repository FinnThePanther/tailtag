import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY,
  PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY,
  optInToConvention,
  type ConventionSummary,
} from '../api/conventions';
import { DAILY_TASKS_QUERY_KEY } from '../../daily-tasks';
import {
  CONVENTION_LEADERBOARD_QUERY_KEY,
  CONVENTION_SUIT_LEADERBOARD_QUERY_KEY,
} from '../../leaderboard';
import { useGeoVerification } from './useGeoVerification';
import { useLocationPermission } from './useLocationPermission';
import { LocationPermissionModal } from '../components/LocationPermissionModal';
import { VerificationErrorModal } from '../components/VerificationErrorModal';

type UseConventionVerificationActionOptions = {
  profileId: string | null | undefined;
  onVerified?: (convention: ConventionSummary) => void;
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
  const { verifyLocation, isVerifying } = useGeoVerification();
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [targetConvention, setTargetConvention] = useState<ConventionSummary | null>(null);

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

      const result = await verifyLocation(convention.id, profileId);
      if (!result.verified) {
        setVerificationError(result.error ?? 'Location verification failed.');
        return false;
      }

      try {
        await optInToConvention({
          profileId,
          conventionId: convention.id,
          verifiedLocation: result.location,
          verificationMethod: 'gps',
        });
        await refreshConventionAccess(convention.id);
        onVerified?.(convention);
        return true;
      } catch (caught) {
        setVerificationError(
          caught instanceof Error
            ? caught.message
            : 'Location verified, but we could not update your convention access.',
        );
        return false;
      }
    },
    [onVerified, profileId, refreshConventionAccess, requestPermission, status, verifyLocation],
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
    isVerifyingConvention: isVerifying || isRequestingPermission,
  };
}
