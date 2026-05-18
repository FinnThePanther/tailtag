import { useState } from 'react';
import * as Location from 'expo-location';

import { verifyConventionLocation } from '../api/geoVerification';
import { captureNonCriticalError, captureHandledMessage } from '@/lib/sentry';
import type { ConventionVerificationErrorCode, VerifiedLocation } from '../api/conventions';

export type VerificationResult =
  | { verified: true; location: VerifiedLocation }
  | {
      verified: false;
      distance_meters?: number | null;
      error?: string | null;
      error_code?: ConventionVerificationErrorCode | null;
    };

type UseGeoVerificationReturn = {
  verifyLocation: (conventionId: string, profileId: string) => Promise<VerificationResult>;
  isVerifying: boolean;
};

const verificationErrorMessage = (
  errorCode: ConventionVerificationErrorCode | null | undefined,
  fallback?: string,
) => {
  switch (errorCode) {
    case 'outside_geofence':
      return "TailTag couldn't confirm you're inside the convention area. Move closer to the venue and try again.";
    case 'profile_not_found':
      return 'Unable to verify location without profile.';
    case 'poor_accuracy':
      return 'Your GPS signal is not accurate enough to verify you. Step outside or move closer to the venue, then try again.';
    case 'rate_limited':
      return "You've tried location verification several times. Wait a bit, then try again on-site.";
    default:
      return fallback ?? 'Location verification failed. Please try again.';
  }
};

export function useGeoVerification(): UseGeoVerificationReturn {
  const [isVerifying, setIsVerifying] = useState(false);

  async function verifyLocation(
    conventionId: string,
    profileId: string,
  ): Promise<VerificationResult> {
    setIsVerifying(true);
    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 0,
      });

      const { latitude, longitude, accuracy } = position.coords;
      const effectiveAccuracy = typeof accuracy === 'number' ? accuracy : 50;
      const roundedAccuracy = Math.max(1, Math.round(effectiveAccuracy));

      const result = await verifyConventionLocation({
        profileId,
        conventionId,
        latitude,
        longitude,
        accuracy: roundedAccuracy,
      });

      captureHandledMessage('geo_verification_result', {
        conventionId,
        verified: result.verified,
        distance_meters: result.distance_meters ?? null,
        radius_meters: result.geofence_radius_meters,
        effective_radius_meters: result.effective_radius_meters ?? null,
        accuracy_meters: roundedAccuracy,
        path: 'verify_convention_location',
        error_code: result.error_code ?? null,
        error: result.error ?? null,
      });

      if (result.verified) {
        return {
          verified: true,
          location: { latitude, longitude, accuracy: roundedAccuracy },
        };
      }

      return {
        verified: false,
        distance_meters: result.distance_meters ?? null,
        error: verificationErrorMessage(
          result.error_code,
          result.error ?? `You must be at ${result.convention_name} to play`,
        ),
        error_code: result.error_code ?? null,
      };
    } catch (error) {
      captureNonCriticalError(error, { scope: 'geo-verification' });
      return {
        verified: false,
        error: 'Unable to verify location. Please try again.',
      };
    } finally {
      setIsVerifying(false);
    }
  }

  return { verifyLocation, isVerifying };
}
