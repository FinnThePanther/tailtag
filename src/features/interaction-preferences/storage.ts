import AsyncStorage from '@react-native-async-storage/async-storage';

import { captureHandledException } from '@/lib/sentry';

const NOTICE_VERSION = 'v1';

const interactionPreferencesNudgeKey = (userId: string) =>
  `tailtag:suits:interaction-preferences-nudge:${NOTICE_VERSION}:${userId}`;

export async function hasDismissedInteractionPreferencesNudge(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(interactionPreferencesNudgeKey(userId))) === 'true';
  } catch (error) {
    captureHandledException(error, {
      scope: 'interaction-preferences.storage',
      additionalContext: {
        operation: 'reading interaction preferences nudge state',
        userId,
      },
    });
    return true;
  }
}

export async function markInteractionPreferencesNudgeDismissed(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(interactionPreferencesNudgeKey(userId), 'true');
  } catch (error) {
    captureHandledException(error, {
      scope: 'interaction-preferences.storage',
      additionalContext: {
        operation: 'dismissing interaction preferences nudge',
        userId,
      },
    });
  }
}
