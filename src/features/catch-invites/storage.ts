import AsyncStorage from '@react-native-async-storage/async-storage';

import { captureHandledException } from '@/lib/sentry';

const PENDING_INVITE_TOKEN_KEY = 'tailtag:pendingCatchInviteToken:v1';

export async function savePendingCatchInviteToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_INVITE_TOKEN_KEY, token);
  } catch (error) {
    captureHandledException(error, { scope: 'catch-invites.savePendingToken' });
  }
}

export async function loadPendingCatchInviteToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PENDING_INVITE_TOKEN_KEY);
  } catch (error) {
    captureHandledException(error, { scope: 'catch-invites.loadPendingToken' });
    return null;
  }
}

export async function clearPendingCatchInviteToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
  } catch (error) {
    captureHandledException(error, { scope: 'catch-invites.clearPendingToken' });
  }
}
