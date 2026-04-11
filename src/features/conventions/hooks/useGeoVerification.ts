import { useState } from 'react';
import * as Location from 'expo-location';

import { verifyConventionLocation } from '../api/geoVerification';
import { captureNonCriticalError, captureHandledMessage } from '@/lib/sentry';
import type { VerifiedLocation } from '../api/conventions';

export type VerificationResult =
  | { verified: true; location: VerifiedLocation }
  | { verified: false; distance_meters?: number | null; error?: string | null };

type UseGeoVerificationReturn = {
  verifyLocation: (conventionId: string, profileId: string) => Promise<VerificationResult>;
  isVerifying: boolean;
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
        error: result.error ?? `You must be at ${result.convention_name} to join`,
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
