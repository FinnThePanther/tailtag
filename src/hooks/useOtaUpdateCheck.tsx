import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, AppState, View, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

import { captureHandledException } from '@/lib/sentry';
import { colors } from '@/theme';

import { savePendingOtaRestoreFromLatestRoute } from './otaRestoreStorage';
import { getOtaUpdateApplicationDecision } from './otaRestoreState';
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
  const hasPendingWarmUpdateRef = useRef(false);
  const [isBlockingUpdateCheck, setIsBlockingUpdateCheck] = useState(
    () => !__DEV__ && Updates.isEnabled,
  );
  const { isStartupProcedureRunning, isUpdatePending, isRestarting } = Updates.useUpdates();

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

  const reloadPendingWarmUpdate = useCallback(
    async (phase: string) => {
      if (!hasPendingWarmUpdateRef.current || hasRequestedReloadRef.current) {
        return;
      }

      hasPendingWarmUpdateRef.current = false;
      await savePendingOtaRestoreFromLatestRoute();
      await reloadPendingUpdate(phase);
    },
    [reloadPendingUpdate],
  );

  const checkForUpdate = useCallback(
    async ({ blockUi }: { blockUi: boolean }) => {
      if (__DEV__ || !Updates.isEnabled) {
        setIsBlockingUpdateCheck(false);
        return;
      }

      if (isCheckingRef.current || hasRequestedReloadRef.current) {
        return;
      }

      isCheckingRef.current = true;

      if (blockUi) {
        setIsBlockingUpdateCheck(true);
      }

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
          const decision = getOtaUpdateApplicationDecision({
            blockUi,
            appState: AppState.currentState,
          });

          if (decision === 'reload-now') {
            await reloadPendingUpdate('fetch');
            return;
          }

          hasPendingWarmUpdateRef.current = true;
        }
      } finally {
        isCheckingRef.current = false;

        if (blockUi && isMountedRef.current && !hasRequestedReloadRef.current) {
          setIsBlockingUpdateCheck(false);
        }
      }
    },
    [reloadPendingUpdate],
  );

  useEffect(() => {
    isMountedRef.current = true;

    void checkForUpdate({ blockUi: true });

    const handleChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void checkForUpdate({ blockUi: false });
        return;
      }

      if (state === 'background') {
        void reloadPendingWarmUpdate('background');
      }
    };
    const subscription = AppState.addEventListener('change', handleChange);

    return () => {
      isMountedRef.current = false;
      subscription.remove();
    };
  }, [checkForUpdate, reloadPendingWarmUpdate]);

  useEffect(() => {
    if (isUpdatePending) {
      const decision = getOtaUpdateApplicationDecision({
        blockUi: isBlockingUpdateCheck,
        appState: AppState.currentState,
      });

      if (decision === 'reload-now') {
        void reloadPendingUpdate('pending');
        return;
      }

      hasPendingWarmUpdateRef.current = true;
    }
  }, [isBlockingUpdateCheck, isUpdatePending, reloadPendingUpdate]);

  const shouldBlockChildren =
    isBlockingUpdateCheck ||
    isStartupProcedureRunning ||
    isRestarting ||
    hasRequestedReloadRef.current;

  if (shouldBlockChildren) {
    return <OtaUpdateLoadingScreen />;
  }

  return <>{children}</>;
}
