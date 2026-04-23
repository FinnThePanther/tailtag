import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

import { captureNonCriticalError } from '@/lib/sentry';

const RESTART_ERROR_MESSAGE = "We couldn't restart TailTag. Please try again.";

export type OtaUpdateState = {
  isUpdateReady: boolean;
  isRestarting: boolean;
  restartError: string | null;
  restartToApplyUpdate: () => Promise<void>;
};

const OtaUpdateContext = createContext<OtaUpdateState | undefined>(undefined);

export function OtaUpdateProvider({ children }: { children: ReactNode }) {
  const [isUpdateReady, setIsUpdateReady] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  const isMountedRef = useRef(false);
  const isCheckingRef = useRef(false);
  const isUpdateReadyRef = useRef(false);

  const markUpdateReady = useCallback(() => {
    isUpdateReadyRef.current = true;
    if (isMountedRef.current) {
      setIsUpdateReady(true);
    }
  }, []);

  const checkForDownloadedUpdate = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled || isCheckingRef.current || isUpdateReadyRef.current) {
      return;
    }

    isCheckingRef.current = true;

    try {
      let result: Updates.UpdateCheckResult;

      try {
        result = await Updates.checkForUpdateAsync();
      } catch (error) {
        captureNonCriticalError(error, { scope: 'ota.check' });
        return;
      }

      if (!isMountedRef.current || !result.isAvailable || isUpdateReadyRef.current) {
        return;
      }

      try {
        await Updates.fetchUpdateAsync();
      } catch (error) {
        captureNonCriticalError(error, { scope: 'ota.fetch' });
        return;
      }

      if (!isMountedRef.current) {
        return;
      }

      markUpdateReady();
    } finally {
      isCheckingRef.current = false;
    }
  }, [markUpdateReady]);

  const restartToApplyUpdate = useCallback(async () => {
    if (!isUpdateReadyRef.current || isRestarting) {
      return;
    }

    setIsRestarting(true);
    setRestartError(null);

    try {
      await Updates.reloadAsync();
    } catch (error) {
      captureNonCriticalError(error, { scope: 'ota.reload' });

      if (isMountedRef.current) {
        setRestartError(RESTART_ERROR_MESSAGE);
        setIsRestarting(false);
      }
    }
  }, [isRestarting]);

  useEffect(() => {
    isMountedRef.current = true;

    void checkForDownloadedUpdate();

    const handleChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void checkForDownloadedUpdate();
      }
    };
    const subscription = AppState.addEventListener('change', handleChange);

    return () => {
      isMountedRef.current = false;
      subscription.remove();
    };
  }, [checkForDownloadedUpdate]);

  const value = useMemo<OtaUpdateState>(
    () => ({
      isUpdateReady,
      isRestarting,
      restartError,
      restartToApplyUpdate,
    }),
    [isRestarting, isUpdateReady, restartError, restartToApplyUpdate],
  );

  return <OtaUpdateContext.Provider value={value}>{children}</OtaUpdateContext.Provider>;
}

export function useOtaUpdateCheck() {
  const context = useContext(OtaUpdateContext);

  if (!context) {
    throw new Error('useOtaUpdateCheck must be used within an OtaUpdateProvider');
  }

  return context;
}
