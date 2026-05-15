import { useCallback, useEffect, useMemo, useState } from 'react';

import type { QueryClient } from '@tanstack/react-query';

import { useToast } from '../../hooks/useToast';
import { loadCatchOutbox, subscribeCatchOutbox, upsertCatchOutboxItem } from './storage';
import { retryCatchOutboxItem, syncCatchOutbox, removeCatchOutboxItem } from './sync';
import type { CatchOutboxItem } from './types';
import type { CatchPhotoSource } from '../catch-confirmations/types';

export function useCatchOutbox(userId: string | null) {
  const [items, setItems] = useState<CatchOutboxItem[]>([]);

  const reload = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }

    setItems(await loadCatchOutbox(userId));
  }, [userId]);

  useEffect(() => {
    void reload().catch((error) => {
      console.error('[catch-outbox] Failed to load outbox', error);
    });
  }, [reload]);

  useEffect(() => subscribeCatchOutbox(setItems), []);

  const visibleItems = useMemo(
    () => items.filter((item) => item.status !== 'confirmed' && item.status !== 'pending_approval'),
    [items],
  );

  const unresolvedItems = useMemo(
    () => items.filter((item) => item.status === 'queued' || item.status === 'syncing'),
    [items],
  );

  const failedItems = useMemo(() => items.filter((item) => item.status === 'failed'), [items]);

  return {
    items,
    visibleItems,
    unresolvedItems,
    failedItems,
    reload,
  };
}

export function useCatchOutboxSync(userId: string | null, queryClient?: QueryClient) {
  const { showToast } = useToast();

  const sync = useCallback(
    (options?: { force?: boolean }) =>
      syncCatchOutbox({
        userId,
        queryClient,
        showToast,
        force: options?.force,
      }),
    [queryClient, showToast, userId],
  );

  const retry = useCallback(
    async (clientAttemptId: string) => {
      if (!userId) return;
      await retryCatchOutboxItem(userId, clientAttemptId);
      await sync({ force: true });
    },
    [sync, userId],
  );

  const dismiss = useCallback(
    async (clientAttemptId: string) => {
      if (!userId) return;
      await removeCatchOutboxItem(userId, clientAttemptId);
    },
    [userId],
  );

  useEffect(() => {
    if (!userId) {
      return;
    }

    void sync().catch((error) => {
      console.error('[catch-outbox] Failed to sync outbox', error);
    });
    const interval = setInterval(() => {
      void sync().catch((error) => {
        console.error('[catch-outbox] Failed to sync outbox', error);
      });
    }, 30 * 1000);

    return () => clearInterval(interval);
  }, [sync, userId]);

  return {
    sync,
    retry,
    dismiss,
  };
}

export async function queueCodeCatchOutboxItem(params: {
  userId: string;
  clientAttemptId: string;
  fursuitCode: string;
}) {
  const now = new Date().toISOString();
  await upsertCatchOutboxItem(params.userId, {
    clientAttemptId: params.clientAttemptId,
    method: 'code',
    status: 'queued',
    fursuitCode: params.fursuitCode,
    createdAt: now,
    retryCount: 0,
  });
}

export async function queuePhotoUploadOutboxItem(params: {
  userId: string;
  clientAttemptId: string;
  catchId: string;
  fursuitId: string;
  fursuitOwnerId?: string;
  fursuitName?: string;
  conventionId: string | null;
  localPhotoUri: string;
  photoSource: CatchPhotoSource;
}) {
  const now = new Date().toISOString();
  await upsertCatchOutboxItem(params.userId, {
    clientAttemptId: params.clientAttemptId,
    method: params.photoSource === 'gallery' ? 'gallery_photo' : 'camera_photo',
    status: 'queued',
    catchId: params.catchId,
    fursuitId: params.fursuitId,
    fursuitOwnerId: params.fursuitOwnerId,
    fursuitName: params.fursuitName,
    conventionId: params.conventionId,
    localPhotoUri: params.localPhotoUri,
    photoSource: params.photoSource,
    createdAt: now,
    retryCount: 0,
  });
}
