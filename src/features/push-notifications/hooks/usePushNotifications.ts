import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

import { useAuth } from '../../auth';
import { captureHandledException } from '../../../lib/sentry';
import {
  fetchPushSettings,
  registerPushToken,
  updatePushPreference,
} from '../api/pushNotifications';
import { getExpoProjectId } from '../utils';

type PermissionStatus = 'undetermined' | 'granted' | 'denied';

type UsePushNotificationsOptions = {
  userId?: string | null;
};

export function usePushNotifications(options: UsePushNotificationsOptions = {}) {
  const { session } = useAuth();
  const resolvedUserId = options.userId ?? session?.user.id ?? null;
  const isSupported = Device.isDevice;

  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [token, setToken] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch((channelError) => {
      captureHandledException(channelError, {
        scope: 'push-notifications.setChannel',
      });
    });
  }, []);

  useEffect(() => {
    if (!isSupported) {
      setPermissionStatus('denied');
      return;
    }

    let isMounted = true;
    Notifications.getPermissionsAsync()
      .then((status) => {
        if (!isMounted) {
          return;
        }
        setPermissionStatus(status.status as PermissionStatus);
      })
      .catch((permissionError) => {
        if (!isMounted) {
          return;
        }
        captureHandledException(permissionError, {
          scope: 'push-notifications.permissions',
          action: 'getPermissions',
        });
      });

    return () => {
      isMounted = false;
    };
  }, [isSupported]);

  useEffect(() => {
    if (!resolvedUserId) {
      setToken(null);
      setIsEnabled(false);
      return;
    }

    let isMounted = true;

    fetchPushSettings(resolvedUserId)
      .then((settings) => {
        if (!isMounted) {
          return;
        }
        setToken(settings.token);
        setIsEnabled(settings.enabled);
      })
      .catch((settingsError) => {
        if (!isMounted) {
          return;
        }
        captureHandledException(settingsError, {
          scope: 'push-notifications.settings',
          action: 'fetch',
          userId: resolvedUserId,
        });
      });

    return () => {
      isMounted = false;
    };
  }, [resolvedUserId]);

  const requestPermissionAndRegister = useCallback(async () => {
    if (!resolvedUserId) {
      setError('You need to be signed in to enable push notifications.');
      return false;
    }

    if (!isSupported) {
      setError('Push notifications require a physical device.');
      return false;
    }

    setIsRegistering(true);
    setError(null);

    try {
      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status as PermissionStatus;

      if (status !== 'granted') {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested.status as PermissionStatus;
      }

      setPermissionStatus(status);

      if (status !== 'granted') {
        await updatePushPreference(resolvedUserId, false);
        setToken(null);
        setIsEnabled(false);
        return false;
      }

      const projectId = getExpoProjectId();
      if (!projectId) {
        throw new Error('Missing Expo project ID for push notifications.');
      }

      const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
      const pushToken = tokenResponse.data;

      await registerPushToken(resolvedUserId, pushToken);
      setToken(pushToken);
      setIsEnabled(true);
      return true;
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : 'Unable to enable push notifications right now.';
      setError(fallbackMessage);
      captureHandledException(caught, {
        scope: 'push-notifications.requestPermission',
        userId: resolvedUserId,
      });
      return false;
    } finally {
      setIsRegistering(false);
    }
  }, [isSupported, resolvedUserId]);

  const disablePushNotifications = useCallback(async () => {
    if (!resolvedUserId) {
      return;
    }

    setIsRegistering(true);
    setError(null);

    try {
      await updatePushPreference(resolvedUserId, false);
      setToken(null);
      setIsEnabled(false);
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : 'Unable to disable push notifications right now.';
      setError(fallbackMessage);
      captureHandledException(caught, {
        scope: 'push-notifications.disable',
        userId: resolvedUserId,
      });
    } finally {
      setIsRegistering(false);
    }
  }, [resolvedUserId]);

  const state = useMemo(
    () => ({
      isSupported,
      permissionStatus,
      token,
      isEnabled,
      isRegistering,
      error,
      requestPermissionAndRegister,
      disablePushNotifications,
    }),
    [
      disablePushNotifications,
      error,
      isEnabled,
      isRegistering,
      isSupported,
      permissionStatus,
      requestPermissionAndRegister,
      token,
    ]
  );

  return state;
}
