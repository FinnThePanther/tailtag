import AsyncStorage from '@react-native-async-storage/async-storage';

import { captureHandledException } from '@/lib/sentry';
import type { CatchOutboxItem } from './types';

const STORAGE_VERSION = 1;
const keyForUser = (userId: string) => `tailtag:catch-outbox:v${STORAGE_VERSION}:${userId}`;

const listeners = new Set<(items: CatchOutboxItem[]) => void>();
const writeQueues = new Map<string, Promise<void>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseItem(value: unknown): CatchOutboxItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const method = value.method;
  if (typeof value.clientAttemptId !== 'string' || typeof value.createdAt !== 'string') {
    return null;
  }

  if (method === 'code') {
    if (typeof value.fursuitCode !== 'string') {
      return null;
    }
  } else if (method === 'camera_photo' || method === 'gallery_photo') {
    if (
      typeof value.catchId !== 'string' ||
      typeof value.localPhotoUri !== 'string' ||
      (value.photoSource !== 'camera' && value.photoSource !== 'gallery')
    ) {
      return null;
    }
  } else {
    return null;
  }

  const status = value.status;
  if (
    status !== 'queued' &&
    status !== 'uploading' &&
    status !== 'syncing' &&
    status !== 'confirmed' &&
    status !== 'pending_approval' &&
    status !== 'failed'
  ) {
    return null;
  }

  return {
    clientAttemptId: value.clientAttemptId,
    method,
    status,
    fursuitCode: typeof value.fursuitCode === 'string' ? value.fursuitCode : undefined,
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
    batchId: typeof value.batchId === 'string' ? value.batchId : undefined,
    batchLabel: typeof value.batchLabel === 'string' ? value.batchLabel : undefined,
    localPhotoUri: typeof value.localPhotoUri === 'string' ? value.localPhotoUri : undefined,
    photoSource:
      value.photoSource === 'camera' || value.photoSource === 'gallery'
        ? value.photoSource
        : undefined,
    photoPath: typeof value.photoPath === 'string' ? value.photoPath : undefined,
    photoUrl:
      typeof value.photoUrl === 'string' || value.photoUrl === null ? value.photoUrl : undefined,
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

function withUserOutboxWriteLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
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

export function subscribeCatchOutbox(listener: (items: CatchOutboxItem[]) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function loadCatchOutbox(userId: string): Promise<CatchOutboxItem[]> {
  return loadCatchOutboxUnlocked(userId);
}

async function loadCatchOutboxUnlocked(userId: string): Promise<CatchOutboxItem[]> {
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
  await withUserOutboxWriteLock(userId, () => saveCatchOutboxUnlocked(userId, items));
}

async function saveCatchOutboxUnlocked(userId: string, items: CatchOutboxItem[]) {
  const sorted = sortItems(items);
  await AsyncStorage.setItem(keyForUser(userId), JSON.stringify(sorted));
  emit(sorted);
}

export async function mutateCatchOutbox(
  userId: string,
  updater: (items: CatchOutboxItem[]) => CatchOutboxItem[],
) {
  await withUserOutboxWriteLock(userId, async () => {
    const items = await loadCatchOutboxUnlocked(userId);
    const next = updater(items);
    if (next === items) {
      return;
    }

    await saveCatchOutboxUnlocked(userId, next);
  });
}

export async function upsertCatchOutboxItem(userId: string, item: CatchOutboxItem) {
  await mutateCatchOutbox(userId, (items) => [
    item,
    ...items.filter((existing) => existing.clientAttemptId !== item.clientAttemptId),
  ]);
}

export async function updateCatchOutboxItem(
  userId: string,
  clientAttemptId: string,
  updater: (item: CatchOutboxItem) => CatchOutboxItem,
) {
  await mutateCatchOutbox(userId, (items) =>
    items.map((item) => (item.clientAttemptId === clientAttemptId ? updater(item) : item)),
  );
}

export async function removeCatchOutboxItem(userId: string, clientAttemptId: string) {
  await mutateCatchOutbox(userId, (items) =>
    items.filter((item) => item.clientAttemptId !== clientAttemptId),
  );
}

function redactAdultBoundaryMetadata(item: CatchOutboxItem): CatchOutboxItem {
  return {
    ...item,
    fursuitId: undefined,
    fursuitName: undefined,
    fursuitAvatarUrl: undefined,
    fursuitAvatarPath: undefined,
    fursuitSpeciesName: undefined,
  };
}

function hasAdultBoundaryMetadata(item: CatchOutboxItem) {
  return (
    item.fursuitId !== undefined ||
    item.fursuitName !== undefined ||
    item.fursuitAvatarUrl !== undefined ||
    item.fursuitAvatarPath !== undefined ||
    item.fursuitSpeciesName !== undefined
  );
}

export async function redactCatchOutboxAdultBoundaryMetadata(userId: string) {
  try {
    await withUserOutboxWriteLock(userId, async () => {
      const items = await loadCatchOutboxUnlocked(userId);
      if (!items.some(hasAdultBoundaryMetadata)) {
        return;
      }

      await saveCatchOutboxUnlocked(userId, items.map(redactAdultBoundaryMetadata));
    });
  } catch (error) {
    captureHandledException(error, {
      scope: 'catch-outbox.storage.redactAdultBoundaryMetadata',
      additionalContext: { userId },
    });
  }
}
