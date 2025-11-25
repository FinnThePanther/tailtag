import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../auth';
import { useToast } from '../../../hooks/useToast';
import { supabase } from '../../../lib/supabase';
import { addMonitoringBreadcrumb, captureHandledException } from '../../../lib/sentry';
import {
  pendingCatchesQueryKey,
  PENDING_CATCHES_QUERY_KEY,
} from '../api/confirmations';
import { CAUGHT_SUITS_QUERY_KEY } from '../../suits';
import { DAILY_TASKS_QUERY_KEY } from '../../daily-tasks/hooks';

/**
 * Mount once inside the app shell so catch confirmation notifications raise toasts in real time.
 * Handles notifications for:
 * - catch_pending: When someone wants to catch your fursuit
 * - catch_confirmed: When your catch was approved
 * - catch_rejected: When your catch was declined
 * - catch_expired: When a pending catch expired
 *
 * Deduplication Strategy:
 * We track processed notification IDs in-memory (processedNotificationIdsRef) to prevent
 * duplicate toasts during the current app session. This handles the race condition where
 * a notification arrives before the realtime subscription is fully established.
 *
 * The Set is cleared on user change to avoid memory leaks and ensure fresh notifications
 * for different users. We limit the Set to 200 entries and use FIFO eviction to prevent
 * unbounded growth during long-lived sessions.
 *
 * NOTE: This is session-only deduplication - notifications may show again after app restart,
 * which is acceptable UX since users expect to see notifications they haven't acted on yet.
 */
export function CatchConfirmationToastManager() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activeUserRef = useRef<string | null>(null);
  const processedNotificationIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const teardown = () => {
      if (!channelRef.current) {
        return;
      }

      const existingChannel = channelRef.current;
      channelRef.current = null;

      existingChannel
        .unsubscribe()
        .catch((unsubscribeError) => {
          captureHandledException(unsubscribeError, {
            scope: 'catch-confirmations.realtime',
            action: 'unsubscribe',
            userId: activeUserRef.current,
          });
        })
        .finally(() => {
          supabase.removeChannel(existingChannel);
          addMonitoringBreadcrumb({
            category: 'realtime',
            message: 'Catch confirmations channel torn down',
            data: { userId: activeUserRef.current },
          });
        });
    };

    if (!userId) {
      teardown();
      activeUserRef.current = null;
      return;
    }

    if (activeUserRef.current === userId && channelRef.current) {
      return;
    }

    teardown();
    processedNotificationIdsRef.current.clear();

    const instanceId = Math.random().toString(36).slice(2, 10);
    activeUserRef.current = userId;

    const channelName = `catch-confirmations:user:${userId}:${instanceId}`;
    const channel = supabase.channel(channelName);
    channelRef.current = channel;

    addMonitoringBreadcrumb({
      category: 'realtime',
      message: 'Catch confirmations channel created',
      data: { userId, channelName, instanceId },
    });

    const handleCatchPending = (payload: Record<string, unknown> | null) => {
      const catcherUsername = typeof payload?.catcher_username === 'string'
        ? payload.catcher_username
        : 'Someone';
      const fursuitName = typeof payload?.fursuit_name === 'string'
        ? payload.fursuit_name
        : 'your fursuit';

      showToast(`${catcherUsername} wants to catch ${fursuitName}`);

      addMonitoringBreadcrumb({
        category: 'catch-confirmations',
        message: 'Catch pending notification received',
        data: { userId, catcherUsername, fursuitName },
      });

      // Invalidate pending catches query
      void queryClient.invalidateQueries({
        queryKey: pendingCatchesQueryKey(userId),
      });
    };

    const handleCatchConfirmed = (payload: Record<string, unknown> | null) => {
      const fursuitName = typeof payload?.fursuit_name === 'string'
        ? payload.fursuit_name
        : 'The fursuit';

      showToast(`${fursuitName} approved your catch!`);

      addMonitoringBreadcrumb({
        category: 'catch-confirmations',
        message: 'Catch confirmed notification received',
        data: { userId, fursuitName },
      });

      // Invalidate caught suits to show the confirmed catch
      void queryClient.invalidateQueries({
        queryKey: [CAUGHT_SUITS_QUERY_KEY, userId],
      });

      // Invalidate daily tasks to update catch-related task progress in real-time
      // Only catches confirmed today count toward today's tasks
      void queryClient.invalidateQueries({
        queryKey: [DAILY_TASKS_QUERY_KEY],
      });
    };

    const handleCatchRejected = (payload: Record<string, unknown> | null) => {
      const fursuitName = typeof payload?.fursuit_name === 'string'
        ? payload.fursuit_name
        : 'The fursuit owner';

      showToast(`${fursuitName} declined your catch request`);

      addMonitoringBreadcrumb({
        category: 'catch-confirmations',
        message: 'Catch rejected notification received',
        data: { userId, fursuitName },
      });

      // Invalidate caught suits to remove the rejected catch
      void queryClient.invalidateQueries({
        queryKey: [CAUGHT_SUITS_QUERY_KEY, userId],
      });
    };

    const handleCatchExpired = (payload: Record<string, unknown> | null) => {
      const fursuitName = typeof payload?.fursuit_name === 'string'
        ? payload.fursuit_name
        : 'A fursuit';

      showToast(`Your catch request for ${fursuitName} has expired`);

      addMonitoringBreadcrumb({
        category: 'catch-confirmations',
        message: 'Catch expired notification received',
        data: { userId, fursuitName },
      });

      // Invalidate both pending catches (for owners) and caught suits (for catchers)
      void queryClient.invalidateQueries({
        queryKey: pendingCatchesQueryKey(userId),
      });
      void queryClient.invalidateQueries({
        queryKey: [CAUGHT_SUITS_QUERY_KEY, userId],
      });
    };

    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const newRow = payload.new as Record<string, unknown> | null;
        if (!newRow || typeof newRow !== 'object') {
          return;
        }

        const idRaw = (newRow as { id?: unknown }).id ?? null;
        const notificationId = typeof idRaw === 'string' ? idRaw : null;

        if (notificationId) {
          const processedIds = processedNotificationIdsRef.current;
          if (processedIds.has(notificationId)) {
            return;
          }
          processedIds.add(notificationId);
          if (processedIds.size > 200) {
            const iterator = processedIds.values().next();
            if (!iterator.done && iterator.value) {
              processedIds.delete(iterator.value);
            }
          }
        }

        const typeRaw = (newRow as { type?: unknown }).type ?? null;
        const type = typeof typeRaw === 'string' ? typeRaw : null;
        if (!type) {
          return;
        }

        const payloadRaw = (newRow as { payload?: unknown }).payload ?? null;
        const notificationPayload =
          typeof payloadRaw === 'object' && payloadRaw !== null
            ? (payloadRaw as Record<string, unknown>)
            : null;

        switch (type) {
          case 'catch_pending':
            handleCatchPending(notificationPayload);
            break;
          case 'catch_confirmed':
            handleCatchConfirmed(notificationPayload);
            break;
          case 'catch_rejected':
            handleCatchRejected(notificationPayload);
            break;
          case 'catch_expired':
            handleCatchExpired(notificationPayload);
            break;
          default:
            // Not a catch confirmation notification, ignore
            break;
        }
      }
    );

    const handleChannelStatus = (status: string, error?: Error) => {
      if (status === 'SUBSCRIBED') {
        addMonitoringBreadcrumb({
          category: 'realtime',
          message: 'Catch confirmations channel subscribed',
          data: { userId, channelName, instanceId },
        });
      } else if (status === 'CHANNEL_ERROR' && error) {
        captureHandledException(error, {
          scope: 'catch-confirmations.realtime',
          action: 'subscribe',
          userId,
          channelName,
        });
      }
    };

    channel.subscribe(handleChannelStatus);

    return () => {
      teardown();
      activeUserRef.current = null;
    };
  }, [userId, queryClient, showToast]);

  return null;
}
