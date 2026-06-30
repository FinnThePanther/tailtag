import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, AppState, View, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

import { captureHandledException } from '@/lib/sentry';
import { colors } from '@/theme';

import { styles } from './useOtaUpdateCheck.styles';

function OtaUpdateLoadingScreen() {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator
        size="large"
        color={colors.primary}
      />
    </View>
  );
}

export function OtaUpdateProvider({ children }: { children: ReactNode }) {
  const isMountedRef = useRef(false);
  const isCheckingRef = useRef(false);
  const hasRequestedReloadRef = useRef(false);
  const [isBlockingUpdateCheck, setIsBlockingUpdateCheck] = useState(
    () => !__DEV__ && Updates.isEnabled,
  );
  const { isStartupProcedureRunning, isUpdatePending, isChecking, isDownloading, isRestarting } =
    Updates.useUpdates();

  const reloadPendingUpdate = useCallback(async (phase: string) => {
    if (__DEV__ || !Updates.isEnabled || hasRequestedReloadRef.current) {
      return;
    }

    hasRequestedReloadRef.current = true;
    setIsBlockingUpdateCheck(true);

    try {
      await Updates.reloadAsync();
    } catch (error) {
      hasRequestedReloadRef.current = false;
      captureHandledException(error, {
        scope: 'ota.reload',
        additionalContext: { phase },
      });

      if (isMountedRef.current) {
        setIsBlockingUpdateCheck(false);
      }
    }
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled) {
      setIsBlockingUpdateCheck(false);
      return;
    }

    if (isCheckingRef.current || hasRequestedReloadRef.current) {
      return;
    }

    isCheckingRef.current = true;
    setIsBlockingUpdateCheck(true);

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

      if (
        !isMountedRef.current ||
        hasRequestedReloadRef.current ||
        (!result.isAvailable && !result.isRollBackToEmbedded)
      ) {
        return;
      }

      let fetchResult: Updates.UpdateFetchResult;

      try {
        fetchResult = await Updates.fetchUpdateAsync();
      } catch (error) {
        captureHandledException(error, {
          scope: 'ota.fetchUpdate',
          additionalContext: { phase: 'fetch' },
        });
        return;
      }

      if (!isMountedRef.current || hasRequestedReloadRef.current) {
        return;
      }

      if (fetchResult.isNew || fetchResult.isRollBackToEmbedded) {
        await reloadPendingUpdate('fetch');
      }
    } finally {
      isCheckingRef.current = false;

      if (isMountedRef.current && !hasRequestedReloadRef.current) {
        setIsBlockingUpdateCheck(false);
      }
    }
  }, [reloadPendingUpdate]);

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

  useEffect(() => {
    if (isUpdatePending) {
      void reloadPendingUpdate('pending');
    }
  }, [isUpdatePending, reloadPendingUpdate]);

  const shouldBlockChildren =
    isBlockingUpdateCheck ||
    isStartupProcedureRunning ||
    isChecking ||
    isDownloading ||
    isUpdatePending ||
    isRestarting ||
    hasRequestedReloadRef.current;

  if (shouldBlockChildren) {
    return <OtaUpdateLoadingScreen />;
  }

  return <>{children}</>;
}
