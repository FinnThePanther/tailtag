import AsyncStorage from '@react-native-async-storage/async-storage';

import { captureHandledException } from '@/lib/sentry';
import type { CatchOutboxItem } from './types';

const STORAGE_VERSION = 1;
const keyForUser = (userId: string) => `tailtag:catch-outbox:v${STORAGE_VERSION}:${userId}`;

const listeners = new Set<(items: CatchOutboxItem[]) => void>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseItem(value: unknown): CatchOutboxItem | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.clientAttemptId !== 'string' ||
    value.method !== 'code' ||
    typeof value.fursuitCode !== 'string' ||
    typeof value.createdAt !== 'string'
  ) {
    return null;
  }

  const status = value.status;
  if (
    status !== 'queued' &&
    status !== 'syncing' &&
    status !== 'confirmed' &&
    status !== 'pending_approval' &&
    status !== 'failed'
  ) {
    return null;
  }

  return {
    clientAttemptId: value.clientAttemptId,
    method: 'code',
    status,
    fursuitCode: value.fursuitCode,
    fursuitId: typeof value.fursuitId === 'string' ? value.fursuitId : undefined,
    fursuitName: typeof value.fursuitName === 'string' ? value.fursuitName : undefined,
    fursuitAvatarUrl:
      typeof value.fursuitAvatarUrl === 'string' || value.fursuitAvatarUrl === null
        ? value.fursuitAvatarUrl
        : undefined,
    fursuitAvatarPath:
      typeof value.fursuitAvatarPath === 'string' || value.fursuitAvatarPath === null
        ? value.fursuitAvatarPath
        : undefined,
    fursuitSpeciesName:
      typeof value.fursuitSpeciesName === 'string' ? value.fursuitSpeciesName : undefined,
    conventionId:
      typeof value.conventionId === 'string' || value.conventionId === null
        ? value.conventionId
        : undefined,
    catchId: typeof value.catchId === 'string' ? value.catchId : undefined,
    catchNumber:
      typeof value.catchNumber === 'number' || value.catchNumber === null
        ? value.catchNumber
        : undefined,
    createdAt: value.createdAt,
    lastAttemptAt: typeof value.lastAttemptAt === 'string' ? value.lastAttemptAt : undefined,
    nextAttemptAt: typeof value.nextAttemptAt === 'string' ? value.nextAttemptAt : undefined,
    resolvedAt: typeof value.resolvedAt === 'string' ? value.resolvedAt : undefined,
    retryCount: typeof value.retryCount === 'number' ? value.retryCount : 0,
    errorCode: typeof value.errorCode === 'string' ? value.errorCode : undefined,
    errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : undefined,
  };
}

function sortItems(items: CatchOutboxItem[]) {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function emit(items: CatchOutboxItem[]) {
  const sorted = sortItems(items);
  listeners.forEach((listener) => listener(sorted));
}

export function subscribeCatchOutbox(listener: (items: CatchOutboxItem[]) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function loadCatchOutbox(userId: string): Promise<CatchOutboxItem[]> {
  const raw = await AsyncStorage.getItem(keyForUser(userId));

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return sortItems(
      parsed.map(parseItem).filter((item): item is CatchOutboxItem => Boolean(item)),
    );
  } catch (error) {
    captureHandledException(error, { scope: 'catch-outbox.storage' });
    return [];
  }
}

export async function saveCatchOutbox(userId: string, items: CatchOutboxItem[]) {
  const sorted = sortItems(items);
  await AsyncStorage.setItem(keyForUser(userId), JSON.stringify(sorted));
  emit(sorted);
}

export async function upsertCatchOutboxItem(userId: string, item: CatchOutboxItem) {
  const items = await loadCatchOutbox(userId);
  const next = [
    item,
    ...items.filter((existing) => existing.clientAttemptId !== item.clientAttemptId),
  ];
  await saveCatchOutbox(userId, next);
}

export async function updateCatchOutboxItem(
  userId: string,
  clientAttemptId: string,
  updater: (item: CatchOutboxItem) => CatchOutboxItem,
) {
  const items = await loadCatchOutbox(userId);
  const next = items.map((item) =>
    item.clientAttemptId === clientAttemptId ? updater(item) : item,
  );
  await saveCatchOutbox(userId, next);
}

export async function removeCatchOutboxItem(userId: string, clientAttemptId: string) {
  const items = await loadCatchOutbox(userId);
  await saveCatchOutbox(
    userId,
    items.filter((item) => item.clientAttemptId !== clientAttemptId),
  );
}
