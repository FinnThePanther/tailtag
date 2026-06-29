import AsyncStorage from '@react-native-async-storage/async-storage';

import { captureHandledException } from '@/lib/sentry';
import type { FursuitSummary } from '../types';

const STORAGE_VERSION = 1;
const keyForUser = (userId: string) => `tailtag:my-suits-order:v${STORAGE_VERSION}:${userId}`;

const listeners = new Set<(userId: string, item: PendingMySuitsOrder | null) => void>();
const writeQueues = new Map<string, Promise<void>>();

export type PendingMySuitsOrder = {
  userId: string;
  fursuitIds: string[];
  createdAt: string;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  retryCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePendingOrder(userId: string, value: unknown): PendingMySuitsOrder | null {
  if (!isRecord(value) || !Array.isArray(value.fursuitIds) || typeof value.createdAt !== 'string') {
    return null;
  }

  const fursuitIds = value.fursuitIds.filter((item): item is string => typeof item === 'string');
  if (fursuitIds.length === 0 || fursuitIds.length !== value.fursuitIds.length) {
    return null;
  }

  return {
    userId,
    fursuitIds,
    createdAt: value.createdAt,
    lastAttemptAt: typeof value.lastAttemptAt === 'string' ? value.lastAttemptAt : undefined,
    nextAttemptAt: typeof value.nextAttemptAt === 'string' ? value.nextAttemptAt : undefined,
    retryCount: typeof value.retryCount === 'number' ? value.retryCount : 0,
  };
}

function emit(userId: string, item: PendingMySuitsOrder | null) {
  listeners.forEach((listener) => listener(userId, item));
}

function withUserOrderWriteLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(userId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(operation);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );

  writeQueues.set(userId, tail);

  return run.finally(() => {
    if (writeQueues.get(userId) === tail) {
      writeQueues.delete(userId);
    }
  });
}

export function subscribeMySuitsOrderOutbox(
  listener: (userId: string, item: PendingMySuitsOrder | null) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function loadPendingMySuitsOrder(userId: string): Promise<PendingMySuitsOrder | null> {
  const raw = await AsyncStorage.getItem(keyForUser(userId));
  if (!raw) {
    return null;
  }

  try {
    return parsePendingOrder(userId, JSON.parse(raw));
  } catch (error) {
    captureHandledException(error, {
      scope: 'suits.orderOutbox.load',
      additionalContext: { userId },
    });
    return null;
  }
}

async function savePendingMySuitsOrderUnlocked(userId: string, item: PendingMySuitsOrder) {
  await AsyncStorage.setItem(keyForUser(userId), JSON.stringify(item));
  emit(userId, item);
}

export async function queueMySuitsOrderSync(params: { userId: string; fursuitIds: string[] }) {
  const item: PendingMySuitsOrder = {
    userId: params.userId,
    fursuitIds: params.fursuitIds,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };

  await withUserOrderWriteLock(params.userId, () =>
    savePendingMySuitsOrderUnlocked(params.userId, item),
  );
}

export async function updatePendingMySuitsOrder(
  userId: string,
  updater: (item: PendingMySuitsOrder) => PendingMySuitsOrder | null,
) {
  await withUserOrderWriteLock(userId, async () => {
    const current = await loadPendingMySuitsOrder(userId);
    if (!current) {
      return;
    }

    const next = updater(current);
    if (!next) {
      await AsyncStorage.removeItem(keyForUser(userId));
      emit(userId, null);
      return;
    }

    await savePendingMySuitsOrderUnlocked(userId, next);
  });
}

export async function removePendingMySuitsOrder(userId: string) {
  await withUserOrderWriteLock(userId, async () => {
    await AsyncStorage.removeItem(keyForUser(userId));
    emit(userId, null);
  });
}

export async function applyPendingMySuitsOrder(
  userId: string,
  suits: FursuitSummary[],
): Promise<FursuitSummary[]> {
  const pending = await loadPendingMySuitsOrder(userId);
  if (!pending) {
    return suits;
  }

  const suitsById = new Map(suits.map((suit) => [suit.id, suit]));
  if (
    pending.fursuitIds.length !== suits.length ||
    !pending.fursuitIds.every((id) => suitsById.has(id))
  ) {
    await removePendingMySuitsOrder(userId);
    return suits;
  }

  return pending.fursuitIds.map((id, index) => ({
    ...suitsById.get(id)!,
    display_order: index,
  }));
}
