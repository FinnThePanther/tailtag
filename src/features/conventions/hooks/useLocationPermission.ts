import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

import { supabase } from '@/lib/supabase';
import { captureHandledException } from '@/lib/sentry';

export type LocationPermissionStatus =
  | 'not_determined'
  | 'granted'
  | 'denied'
  | 'restricted';

type PermissionSource = 'check' | 'request';

type UseLocationPermissionReturn = {
  status: LocationPermissionStatus;
  requestPermission: () => Promise<boolean>;
  isLoading: boolean;
};

export function useLocationPermission(profileId?: string, enabled = true): UseLocationPermissionReturn {
  const [status, setStatus] = useState<LocationPermissionStatus>('not_determined');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (enabled) {
      void checkPermission();
    }
  }, [enabled]);

  async function checkPermission() {
    if (!enabled) return;
    try {
      const { status: nativeStatus } = await Location.getForegroundPermissionsAsync();
      const mapped = mapPermissionStatus(nativeStatus);
      setStatus(mapped);
      await persistPermission(mapped, 'check');
    } catch (error) {
      captureHandledException(error, { scope: 'location-permission.check' });
    }
  }

  async function requestPermission(): Promise<boolean> {
    if (!enabled) return false;
    setIsLoading(true);
    try {
      const { status: nativeStatus } = await Location.requestForegroundPermissionsAsync();
      const mapped = mapPermissionStatus(nativeStatus);
      setStatus(mapped);
      await persistPermission(mapped, 'request');
      return mapped === 'granted';
    } catch (error) {
      captureHandledException(error, { scope: 'location-permission.request' });
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  async function persistPermission(nextStatus: LocationPermissionStatus, source: PermissionSource) {
    if (!profileId) return;
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      location_permission_status: nextStatus === 'not_determined' ? 'not_requested' : nextStatus,
    };

    if (source === 'request') {
      payload.location_permission_requested_at = now;
    }
    if (nextStatus === 'granted') {
      payload.location_permission_granted_at = now;
    }

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', profileId);

    if (error) {
      captureHandledException(error, { scope: 'location-permission.persist', profileId });
    }
  }

  return { status, requestPermission, isLoading };
}

function mapPermissionStatus(status: Location.PermissionStatus): LocationPermissionStatus {
  switch (status) {
    case Location.PermissionStatus.GRANTED:
      return 'granted';
    case Location.PermissionStatus.DENIED:
      return 'denied';
    case Location.PermissionStatus.UNDETERMINED:
      return 'not_determined';
    default:
      return 'restricted';
  }
}
