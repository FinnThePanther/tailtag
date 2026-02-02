import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

import { useAuth } from '../../auth';
import { captureNonCriticalError } from '../../../lib/sentry';
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

const logPrefix = '[push-notifications]';

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
    if (Platform.OS !== 'android') {
      return;
    }

    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch((channelError) => {
      captureNonCriticalError(channelError, {
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
        captureNonCriticalError(permissionError, {
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
        captureNonCriticalError(settingsError, {
          scope: 'push-notifications.settings',
          action: 'fetch',
          userId: resolvedUserId,
        });
      });

    return () => {
      isMounted = false;
    };
  }, [resolvedUserId]);

  const refreshState = useCallback(async () => {
    if (!isSupported) {
      setPermissionStatus('denied');
      return;
    }

    try {
      const status = await Notifications.getPermissionsAsync();
      setPermissionStatus(status.status as PermissionStatus);
    } catch (permissionError) {
      captureNonCriticalError(permissionError, {
        scope: 'push-notifications.permissions',
        action: 'refreshPermissions',
      });
    }

    if (!resolvedUserId) {
      return;
    }

    try {
      const settings = await fetchPushSettings(resolvedUserId);
      setToken(settings.token);
      setIsEnabled(settings.enabled);
    } catch (settingsError) {
      captureNonCriticalError(settingsError, {
        scope: 'push-notifications.settings',
        action: 'refresh',
        userId: resolvedUserId,
      });
    }
  }, [isSupported, resolvedUserId]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void refreshState();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [refreshState]);

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
    console.info(`${logPrefix} requestPermissionAndRegister:start`, {
      userId: resolvedUserId,
      isDevice: Device.isDevice,
      platform: Platform.OS,
    });

    try {
      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status as PermissionStatus;
      console.info(`${logPrefix} permissions:current`, { status });

      if (status !== 'granted') {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested.status as PermissionStatus;
        console.info(`${logPrefix} permissions:requested`, { status });
      }

      setPermissionStatus(status);

      if (status !== 'granted') {
        await updatePushPreference(resolvedUserId, false);
        setToken(null);
        setIsEnabled(false);
        console.info(`${logPrefix} permissions:denied`, { userId: resolvedUserId });
        return false;
      }

      const projectId = getExpoProjectId();
      if (!projectId) {
        throw new Error('Missing Expo project ID for push notifications.');
      }
      console.info(`${logPrefix} projectId:resolved`, { hasProjectId: true });

      let pushToken = '';
      try {
        const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
        pushToken = tokenResponse.data;
        console.info(`${logPrefix} expoPushToken:received`, {
          token: pushToken || 'empty',
        });
      } catch (tokenError) {
        console.error(`${logPrefix} expoPushToken:error`, tokenError);
        throw tokenError;
      }

      await registerPushToken(resolvedUserId, pushToken);
      setToken(pushToken);
      setIsEnabled(true);
      console.info(`${logPrefix} register:success`, { userId: resolvedUserId });
      return true;
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : 'Unable to enable push notifications right now.';
      setError(fallbackMessage);
      console.error(`${logPrefix} requestPermissionAndRegister:error`, caught);
      captureNonCriticalError(caught, {
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
      captureNonCriticalError(caught, {
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
      refreshState,
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
      refreshState,
      requestPermissionAndRegister,
      token,
    ]
  );

  return state;
}
