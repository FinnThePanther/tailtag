import { useState } from 'react';
import * as Location from 'expo-location';

import { verifyConventionLocation } from '../api/geoVerification';
import { captureNonCriticalError, captureHandledMessage } from '@/lib/sentry';
import { normalizeAccuracy, verificationErrorMessage } from '../utils';
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

export function useGeoVerification(): UseGeoVerificationReturn {
  const [isVerifying, setIsVerifying] = useState(false);

  async function verifyLocation(
    conventionId: string,
    profileId: string,
  ): Promise<VerificationResult> {
    setIsVerifying(true);

    async function verifyWithPosition(
      conventionId: string,
      profileId: string,
      latitude: number,
      longitude: number,
      accuracy: number | null,
    ): Promise<VerificationResult> {
      const roundedAccuracy = normalizeAccuracy(accuracy);

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
    }

    try {
      // Fast-path: try recently-cached GPS position first to avoid 3–15s cold fix.
      const cached = await Location.getLastKnownPositionAsync({
        maxAge: 30000,
        requiredAccuracy: 100,
      });

      if (cached) {
        const result = await verifyWithPosition(
          conventionId,
          profileId,
          cached.coords.latitude,
          cached.coords.longitude,
          cached.coords.accuracy,
        );
        if (result.verified) {
          return result;
        }
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
        // GPS timed out — try a last-ditch cached position with relaxed criteria.
        const lastDitch = await Location.getLastKnownPositionAsync({
          maxAge: 120_000,
          requiredAccuracy: 500,
        });
        if (lastDitch) {
          return await verifyWithPosition(
            conventionId,
            profileId,
            lastDitch.coords.latitude,
            lastDitch.coords.longitude,
            lastDitch.coords.accuracy,
          );
        }
        return { verified: false, error: 'GPS took too long. Move to an open area and try again.' };
      }

      return await verifyWithPosition(
        conventionId,
        profileId,
        position.coords.latitude,
        position.coords.longitude,
        position.coords.accuracy,
      );
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
