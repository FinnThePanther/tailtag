import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTICE_VERSION = 'v1';

const interactionPreferencesNudgeKey = (userId: string) =>
  `tailtag:suits:interaction-preferences-nudge:${NOTICE_VERSION}:${userId}`;

export async function hasDismissedInteractionPreferencesNudge(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(interactionPreferencesNudgeKey(userId))) === 'true';
  } catch (error) {
    console.warn('Failed to read interaction preferences nudge state', error);
    return true;
  }
}

export async function markInteractionPreferencesNudgeDismissed(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(interactionPreferencesNudgeKey(userId), 'true');
  } catch (error) {
    console.warn('Failed to dismiss interaction preferences nudge', error);
  }
}
