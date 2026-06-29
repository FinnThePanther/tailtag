import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth';
import { syncMySuitsOrder } from '@/features/suits/api/mySuitsOrderSync';

const FOREGROUND_SYNC_THROTTLE_MS = 5 * 1000;

export function MySuitsOrderSyncManager() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;
  const lastForegroundSyncAtRef = useRef(0);

  const sync = useCallback(
    (options?: { force?: boolean }) =>
      syncMySuitsOrder({
        userId,
        queryClient,
        force: options?.force,
      }),
    [queryClient, userId],
  );

  useEffect(() => {
    if (!userId) {
      return;
    }

    void sync().catch((error) => {
      console.error('[my-suits-order] Failed to sync order', error);
    });
    const interval = setInterval(() => {
      void sync().catch((error) => {
        console.error('[my-suits-order] Failed to sync order', error);
      });
    }, 30 * 1000);

    return () => clearInterval(interval);
  }, [sync, userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        return;
      }

      const now = Date.now();
      if (now - lastForegroundSyncAtRef.current < FOREGROUND_SYNC_THROTTLE_MS) {
        return;
      }

      lastForegroundSyncAtRef.current = now;
      void sync({ force: true }).catch((error) => {
        console.error('[my-suits-order] Failed to sync order on foreground', error);
      });
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => subscription.remove();
  }, [sync, userId]);

  return null;
}
