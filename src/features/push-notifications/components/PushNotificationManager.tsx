import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';

import { useAuth } from '../../auth';
import { captureHandledException } from '../../../lib/sentry';
import {
  clearPushToken,
  fetchPushSettings,
  registerPushToken,
  updatePushPreference,
} from '../api/pushNotifications';
import { getDeepLinkForNotificationType } from '../types';
import { getExpoProjectId } from '../utils';

type PermissionStatus = 'undetermined' | 'granted' | 'denied';

type NotificationData = {
  type?: unknown;
};

function extractTypeFromNotification(response: Notifications.NotificationResponse | null) {
  if (!response) {
    return null;
  }

  const data = response.notification.request.content.data as NotificationData | undefined;
  return data?.type ?? null;
}

export function PushNotificationManager() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const router = useRouter();
  const pendingRouteRef = useRef<string | null>(null);
  const previousUserIdRef = useRef<string | null>(null);
  const lastPermissionStatusRef = useRef<PermissionStatus>('undetermined');
  const isSyncingRef = useRef(false);
  const handledNotificationIdsRef = useRef<Set<string>>(new Set());

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
        scope: 'push-notifications.manager.channel',
      });
    });
  }, []);

  const handleNavigation = useCallback(
    (notificationType: unknown) => {
      const route = getDeepLinkForNotificationType(notificationType);
      if (!route) {
        return;
      }

      if (session?.user) {
        router.push(route);
        return;
      }

      pendingRouteRef.current = route;
    },
    [router, session]
  );

  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const notificationId = response.notification.request.identifier;

      // Deduplicate: check if we've already handled this notification
      if (handledNotificationIdsRef.current.has(notificationId)) {
        return;
      }

      // Mark as handled
      handledNotificationIdsRef.current.add(notificationId);

      const notificationType = extractTypeFromNotification(response);
      handleNavigation(notificationType);
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);

    return () => {
      subscription.remove();
    };
  }, [handleNavigation]);

  useEffect(() => {
    let isMounted = true;

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!isMounted || !response) {
          return;
        }

        const notificationId = response.notification.request.identifier;

        // Deduplicate: check if we've already handled this notification
        if (handledNotificationIdsRef.current.has(notificationId)) {
          return;
        }

        // Mark as handled
        handledNotificationIdsRef.current.add(notificationId);

        const notificationType = extractTypeFromNotification(response);
        handleNavigation(notificationType);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        captureHandledException(error, {
          scope: 'push-notifications.manager.lastResponse',
        });
      });

    return () => {
      isMounted = false;
    };
  }, [handleNavigation]);

  useEffect(() => {
    if (!session?.user || !pendingRouteRef.current) {
      return;
    }

    const route = pendingRouteRef.current;
    pendingRouteRef.current = null;
    router.push(route);
  }, [router, session]);

  const syncPushState = useCallback(
    async (reason: string) => {
      if (!userId || !Device.isDevice || isSyncingRef.current) {
        return;
      }

      isSyncingRef.current = true;

      try {
        const permissions = await Notifications.getPermissionsAsync();
        const status = permissions.status as PermissionStatus;
        const previousStatus = lastPermissionStatusRef.current;
        lastPermissionStatusRef.current = status;

        if (status !== 'granted') {
          await updatePushPreference(userId, false);
          return;
        }

        const projectId = getExpoProjectId();
        if (!projectId) {
          throw new Error('Missing Expo project ID for push notifications.');
        }

        const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
        const pushToken = tokenResponse.data;

        let settings = null as { token: string | null; enabled: boolean } | null;
        try {
          settings = await fetchPushSettings(userId);
        } catch (settingsError) {
          captureHandledException(settingsError, {
            scope: 'push-notifications.manager.fetchSettings',
            userId,
          });
        }

        const shouldRefreshToken = !settings || settings.token !== pushToken;
        const shouldAutoEnable = previousStatus === 'denied' || previousStatus === 'undetermined';
        const shouldEnable = settings?.enabled === true;

        if (shouldRefreshToken || shouldAutoEnable || shouldEnable) {
          await registerPushToken(userId, pushToken);
        }
      } catch (error) {
        captureHandledException(error, {
          scope: 'push-notifications.manager.sync',
          reason,
          userId,
        });
      } finally {
        isSyncingRef.current = false;
      }
    },
    [userId]
  );

  useEffect(() => {
    if (!userId) {
      return;
    }

    void syncPushState('initial');
  }, [syncPushState, userId]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void syncPushState('foreground');
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [syncPushState]);

  useEffect(() => {
    if (previousUserIdRef.current && !userId) {
      void clearPushToken(previousUserIdRef.current).catch((error) => {
        captureHandledException(error, {
          scope: 'push-notifications.manager.signout',
          userId: previousUserIdRef.current,
        });
      });
    }

    previousUserIdRef.current = userId;
  }, [userId]);

  return null;
}
