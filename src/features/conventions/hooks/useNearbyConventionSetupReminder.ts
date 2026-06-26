import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';

import {
  fetchNearbyConventionSetupReminder,
  type NearbyConventionSetupReminder,
} from '@/features/conventions/api/nearbyConventionReminders';
import { captureNonCriticalError } from '@/lib/sentry';

const LOCATION_TIMEOUT_MS = 4500;
const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000;

type UseNearbyConventionSetupReminderOptions = {
  enabled: boolean;
  userId: string | null | undefined;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => resolve(null), timeoutMs);

    promise
      .then((value) => resolve(value))
      .catch((error) => {
        captureNonCriticalError(error, {
          scope: 'nearby-convention-reminders.location',
        });
        resolve(null);
      })
      .finally(() => clearTimeout(timeoutId));
  });
}

async function resolveForegroundLocation(): Promise<Location.LocationObject | null> {
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    return null;
  }

  const cached = await Location.getLastKnownPositionAsync({
    maxAge: LAST_KNOWN_MAX_AGE_MS,
    requiredAccuracy: 1000,
  }).catch((error) => {
    captureNonCriticalError(error, {
      scope: 'nearby-convention-reminders.lastKnownLocation',
    });
    return null;
  });

  if (cached) {
    return cached;
  }

  return withTimeout(
    Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }),
    LOCATION_TIMEOUT_MS,
  );
}

export function useNearbyConventionSetupReminder({
  enabled,
  userId,
}: UseNearbyConventionSetupReminderOptions) {
  const [reminder, setReminder] = useState<NearbyConventionSetupReminder | null>(null);
  const [dismissedConventionIds, setDismissedConventionIds] = useState<Set<string>>(
    () => new Set(),
  );

  const dismissLocally = useCallback((conventionId: string) => {
    setDismissedConventionIds((current) => {
      if (current.has(conventionId)) {
        return current;
      }

      const next = new Set(current);
      next.add(conventionId);
      return next;
    });
    setReminder((current) => (current?.conventionId === conventionId ? null : current));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function checkReminder() {
        if (!enabled || !userId) {
          if (isActive) {
            setReminder(null);
          }
          return;
        }

        const location = await resolveForegroundLocation();
        if (!isActive || !location) {
          return;
        }

        const nextReminder = await fetchNearbyConventionSetupReminder({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracyMeters: location.coords.accuracy,
        });

        if (!isActive) {
          return;
        }

        setReminder(
          nextReminder && !dismissedConventionIds.has(nextReminder.conventionId)
            ? nextReminder
            : null,
        );
      }

      void checkReminder();

      return () => {
        isActive = false;
      };
    }, [dismissedConventionIds, enabled, userId]),
  );

  return {
    reminder,
    dismissLocally,
  };
}
