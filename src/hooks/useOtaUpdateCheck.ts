import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

import { captureNonCriticalError } from '@/lib/sentry';

// Silently checks for EAS OTA updates at launch and on foreground.
// A fetched bundle activates on the next cold start — we never call
// reloadAsync() mid-session to avoid interrupting the user.
export function useOtaUpdateCheck() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    let cancelled = false;

    const check = async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (cancelled || !result.isAvailable) return;
        await Updates.fetchUpdateAsync();
      } catch (error) {
        captureNonCriticalError(error, { scope: 'ota.check' });
      }
    };

    void check();

    const handleChange = (state: AppStateStatus) => {
      if (state === 'active') void check();
    };
    const subscription = AppState.addEventListener('change', handleChange);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);
}
