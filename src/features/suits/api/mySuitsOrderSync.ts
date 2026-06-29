import type { QueryClient } from '@tanstack/react-query';

import { captureHandledException } from '@/lib/sentry';
import { MY_SUITS_QUERY_KEY, mySuitsQueryKey, reorderMySuits } from './mySuits';
import {
  loadPendingMySuitsOrder,
  type PendingMySuitsOrder,
  updatePendingMySuitsOrder,
} from './mySuitsOrderOutbox';

const MAX_BACKOFF_MS = 5 * 60 * 1000;

let isSyncing = false;

function nowIso() {
  return new Date().toISOString();
}

function backoffMs(retryCount: number) {
  return Math.min(MAX_BACKOFF_MS, 2 ** Math.max(0, retryCount) * 5 * 1000);
}

function shouldAttempt(nextAttemptAt: string | undefined, force: boolean) {
  return force || !nextAttemptAt || Date.parse(nextAttemptAt) <= Date.now();
}

function isSamePendingOrder(left: PendingMySuitsOrder, right: PendingMySuitsOrder) {
  return (
    left.createdAt === right.createdAt &&
    left.fursuitIds.length === right.fursuitIds.length &&
    left.fursuitIds.every((id, index) => id === right.fursuitIds[index])
  );
}

export async function syncMySuitsOrder(options: {
  userId: string | null;
  queryClient?: QueryClient;
  force?: boolean;
}) {
  const { userId, queryClient, force = false } = options;
  if (!userId || isSyncing) {
    return;
  }

  const pending = await loadPendingMySuitsOrder(userId);
  if (!pending || !shouldAttempt(pending.nextAttemptAt, force)) {
    return;
  }

  isSyncing = true;
  const attemptStartedAt = nowIso();

  try {
    await updatePendingMySuitsOrder(userId, (item) => ({
      ...item,
      lastAttemptAt: attemptStartedAt,
      nextAttemptAt: undefined,
    }));
    await reorderMySuits(pending.fursuitIds);
    await updatePendingMySuitsOrder(userId, (item) =>
      isSamePendingOrder(item, pending) ? null : item,
    );
    void queryClient?.invalidateQueries({ queryKey: mySuitsQueryKey(userId) });
    void queryClient?.invalidateQueries({ queryKey: [MY_SUITS_QUERY_KEY, userId] });
  } catch (error) {
    const retryCount = pending.retryCount + 1;
    await updatePendingMySuitsOrder(userId, (item) =>
      isSamePendingOrder(item, pending)
        ? {
            ...item,
            lastAttemptAt: attemptStartedAt,
            nextAttemptAt: new Date(Date.now() + backoffMs(retryCount)).toISOString(),
            retryCount,
          }
        : item,
    );
    captureHandledException(error, {
      scope: 'suits.orderOutbox.sync',
      additionalContext: {
        userId,
        retryCount,
      },
    });
  } finally {
    isSyncing = false;
  }
}
