import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

import { captureHandledException } from '@/lib/sentry';

export function OtaUpdateProvider({ children }: { children: ReactNode }) {
  const isMountedRef = useRef(false);
  const isCheckingRef = useRef(false);
  const hasFetchedPendingUpdateRef = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (
      __DEV__ ||
      !Updates.isEnabled ||
      isCheckingRef.current ||
      hasFetchedPendingUpdateRef.current
    ) {
      return;
    }

    isCheckingRef.current = true;

    try {
      let result: Updates.UpdateCheckResult;

      try {
        result = await Updates.checkForUpdateAsync();
      } catch (error) {
        captureHandledException(error, {
          scope: 'ota.checkForUpdate',
          additionalContext: { phase: 'check' },
        });
        return;
      }

      if (!isMountedRef.current || !result.isAvailable || hasFetchedPendingUpdateRef.current) {
        return;
      }

      try {
        await Updates.fetchUpdateAsync();
      } catch (error) {
        captureHandledException(error, {
          scope: 'ota.fetchUpdate',
          additionalContext: { phase: 'fetch' },
        });
        return;
      }

      hasFetchedPendingUpdateRef.current = true;
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    void checkForUpdate();

    const handleChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void checkForUpdate();
      }
    };
    const subscription = AppState.addEventListener('change', handleChange);

    return () => {
      isMountedRef.current = false;
      subscription.remove();
    };
  }, [checkForUpdate]);

  return <>{children}</>;
}
