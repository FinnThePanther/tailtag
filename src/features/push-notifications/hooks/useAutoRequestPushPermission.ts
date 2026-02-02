import { useEffect, useRef } from 'react';

import { useAuth } from '../../auth';
import { useQuery } from '@tanstack/react-query';
import { createProfileQueryOptions } from '../../profile';
import { usePushNotifications } from './usePushNotifications';
import { markPushNotificationPrompted } from '../api/pushNotifications';
import { captureNonCriticalError } from '../../../lib/sentry';

/**
 * Hook to automatically request push notification permissions on first visit to home screen.
 *
 * Rules:
 * - Only requests once per user (tracked in database via push_notifications_prompted)
 * - Respects user opt-out (push_notifications_enabled === false)
 * - Silently registers token if permission already granted
 * - Uses fire-and-forget pattern (non-blocking)
 * - Marks user as prompted regardless of outcome
 */
export function useAutoRequestPushPermission() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const hasRequestedThisSessionRef = useRef(false);

  // Get profile to check if user has been prompted before
  const { data: profile } = useQuery({
    ...createProfileQueryOptions(userId ?? ''),
    enabled: Boolean(userId),
  });

  // Get push notification state
  const {
    isSupported,
    permissionStatus,
    requestPermissionAndRegister,
  } = usePushNotifications({ userId });

  useEffect(() => {
    // Guard: Not authenticated
    if (!session || !userId) {
      return;
    }

    // Guard: Simulator or unsupported device
    if (!isSupported) {
      return;
    }

    // Guard: Already ran this session (prevent duplicate prompts on re-render)
    if (hasRequestedThisSessionRef.current) {
      return;
    }

    // Guard: Profile not loaded yet
    if (!profile) {
      return;
    }

    // Guard: User already prompted before (database tracking)
    // This handles both cases: user accepted OR user declined previously
    if (profile.push_notifications_prompted === true) {
      return;
    }

    // Mark that we've run this session
    hasRequestedThisSessionRef.current = true;

    // Permission already granted - just register token silently
    if (permissionStatus === 'granted') {
      void (async () => {
        try {
          await requestPermissionAndRegister();
        } catch (error) {
          captureNonCriticalError(error, {
            scope: 'push-notifications.auto-request.silentRegister',
            userId,
          });
        } finally {
          // Mark as prompted regardless of outcome
          void markPushNotificationPrompted(userId).catch((markError) => {
            captureNonCriticalError(markError, {
              scope: 'push-notifications.auto-request.markPrompted',
              userId,
            });
          });
        }
      })();

      return;
    }

    // Permission undetermined - request permission
    if (permissionStatus === 'undetermined') {
      void (async () => {
        try {
          await requestPermissionAndRegister();
        } catch (error) {
          captureNonCriticalError(error, {
            scope: 'push-notifications.auto-request.requestPermission',
            userId,
          });
        } finally {
          // Mark as prompted regardless of outcome (grant or deny)
          void markPushNotificationPrompted(userId).catch((markError) => {
            captureNonCriticalError(markError, {
              scope: 'push-notifications.auto-request.markPrompted',
              userId,
            });
          });
        }
      })();

      return;
    }

    // Permission denied - do nothing, but mark as prompted
    if (permissionStatus === 'denied') {
      void markPushNotificationPrompted(userId).catch((error) => {
        captureNonCriticalError(error, {
          scope: 'push-notifications.auto-request.markPrompted',
          userId,
        });
      });
    }
  }, [session, userId, isSupported, profile, permissionStatus, requestPermissionAndRegister]);
}
