import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';

import { useAuth } from '../../auth';
import { captureNonCriticalError } from '../../../lib/sentry';
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

const logPrefix = '[push-notifications]';
const MAX_HANDLED_NOTIFICATION_IDS = 1000;

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
  // Use Map instead of Set to maintain insertion order for LRU eviction
  const handledNotificationIdsRef = useRef<Map<string, number>>(new Map());

  // Helper to add notification ID with bounded size (LRU eviction)
  const addHandledNotificationId = useCallback((notificationId: string) => {
    const cache = handledNotificationIdsRef.current;

    // If already exists, update timestamp to mark as recently used
    if (cache.has(notificationId)) {
      cache.delete(notificationId);
    }

    // Add with current timestamp
    cache.set(notificationId, Date.now());

    // Evict oldest entries if size exceeds limit
    if (cache.size > MAX_HANDLED_NOTIFICATION_IDS) {
      // Map maintains insertion order, so first key is oldest
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) {
        cache.delete(firstKey);
      }
    }
  }, []);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const appState = AppState.currentState;

        // If app is active, suppress system notification
        // Toasts are handled via Realtime subscriptions on notifications table
        if (appState === 'active') {
          console.log(`${logPrefix} Suppressing foreground notification (will show via toast)`);
          return {
            shouldShowAlert: false,
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: false,
            shouldShowList: false,
          };
        }

        // App is background/inactive - show system notification
        console.log(`${logPrefix} Showing system notification (app in background)`);
        return {
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        };
      },
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
      captureNonCriticalError(channelError, {
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

      // Mark as handled (with LRU eviction)
      addHandledNotificationId(notificationId);

      const notificationType = extractTypeFromNotification(response);
      handleNavigation(notificationType);
    };

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleResponse);

    // Listen for notifications received while app is in foreground
    const foregroundSubscription = Notifications.addNotificationReceivedListener((notification) => {
      console.log(`${logPrefix} Received push notification in foreground:`, {
        title: notification.request.content.title,
        body: notification.request.content.body,
        data: notification.request.content.data,
      });

      // Note: Actual toast display is handled via Realtime subscriptions
      // This listener is here for logging and potential future use
    });

    return () => {
      responseSubscription.remove();
      foregroundSubscription.remove();
    };
  }, [handleNavigation, addHandledNotificationId]);

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

        // Mark as handled (with LRU eviction)
        addHandledNotificationId(notificationId);

        const notificationType = extractTypeFromNotification(response);
        handleNavigation(notificationType);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        captureNonCriticalError(error, {
          scope: 'push-notifications.manager.lastResponse',
        });
      });

    return () => {
      isMounted = false;
    };
  }, [handleNavigation, addHandledNotificationId]);

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
      console.info(`${logPrefix} sync:start`, { reason, userId });

      try {
        const permissions = await Notifications.getPermissionsAsync();
        const status = permissions.status as PermissionStatus;
        const previousStatus = lastPermissionStatusRef.current;
        lastPermissionStatusRef.current = status;
        console.info(`${logPrefix} sync:permissions`, { status, previousStatus });

        if (status !== 'granted') {
          await updatePushPreference(userId, false);
          console.info(`${logPrefix} sync:permissionDenied`, { userId });
          return;
        }

        const projectId = getExpoProjectId();
        if (!projectId) {
          throw new Error('Missing Expo project ID for push notifications.');
        }
        console.info(`${logPrefix} sync:projectIdResolved`, { hasProjectId: true });

        let pushToken = '';
        try {
          const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
          pushToken = tokenResponse.data;
          console.info(`${logPrefix} sync:expoPushToken`, {
            token: pushToken || 'empty',
          });
        } catch (tokenError) {
          console.error(`${logPrefix} sync:expoPushTokenError`, tokenError);
          throw tokenError;
        }

        let settings = null as { token: string | null; enabled: boolean } | null;
        try {
          settings = await fetchPushSettings(userId);
        } catch (settingsError) {
          captureNonCriticalError(settingsError, {
            scope: 'push-notifications.manager.fetchSettings',
            userId,
          });
        }

        const shouldRefreshToken = !settings || settings.token !== pushToken;
        const userExplicitlyDisabled = settings?.enabled === false;
        const shouldAutoEnable =
          (previousStatus === 'denied' || previousStatus === 'undetermined') &&
          !userExplicitlyDisabled;
        const shouldEnable = settings?.enabled === true;

        if (shouldRefreshToken || shouldAutoEnable || shouldEnable) {
          await registerPushToken(userId, pushToken);
          console.info(`${logPrefix} sync:register`, {
            shouldRefreshToken,
            shouldAutoEnable,
            shouldEnable,
            userExplicitlyDisabled,
          });
        }
      } catch (error) {
        console.error(`${logPrefix} sync:error`, error);
        captureNonCriticalError(error, {
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
    const prevUserId = previousUserIdRef.current;
    if (prevUserId && !userId) {
      void clearPushToken(prevUserId).catch((error) => {
        captureNonCriticalError(error, {
          scope: 'push-notifications.manager.signout',
          userId: prevUserId,
        });
      });
    }

    previousUserIdRef.current = userId;
  }, [userId]);

  return null;
}
