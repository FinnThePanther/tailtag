import AsyncStorage from '@react-native-async-storage/async-storage';

import { captureHandledException } from '@/lib/sentry';

const PENDING_INVITE_TOKEN_KEY = 'tailtag:pendingCatchInviteToken:v1';

type PendingCatchInviteTokenListener = (token: string | null) => void;

const pendingCatchInviteTokenListeners = new Set<PendingCatchInviteTokenListener>();

function notifyPendingCatchInviteTokenListeners(token: string | null) {
  pendingCatchInviteTokenListeners.forEach((listener) => {
    listener(token);
  });
}

export function subscribePendingCatchInviteToken(
  listener: PendingCatchInviteTokenListener,
): () => void {
  pendingCatchInviteTokenListeners.add(listener);
  return () => {
    pendingCatchInviteTokenListeners.delete(listener);
  };
}

export async function savePendingCatchInviteToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_INVITE_TOKEN_KEY, token);
    notifyPendingCatchInviteTokenListeners(token);
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
    notifyPendingCatchInviteTokenListeners(null);
  } catch (error) {
    captureHandledException(error, { scope: 'catch-invites.clearPendingToken' });
  }
}
