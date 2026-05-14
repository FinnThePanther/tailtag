import { useCallback, useEffect, useMemo, useState } from 'react';

import type { QueryClient } from '@tanstack/react-query';

import { useToast } from '../../hooks/useToast';
import { loadCatchOutbox, subscribeCatchOutbox, upsertCatchOutboxItem } from './storage';
import { retryCatchOutboxItem, syncCatchOutbox, removeCatchOutboxItem } from './sync';
import type { CatchOutboxItem } from './types';

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
    void reload();
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

    void sync();
    const interval = setInterval(() => {
      void sync();
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
