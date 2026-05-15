import type { QueryClient } from '@tanstack/react-query';

import {
  CODE_CATCH_OUTBOX_TIMEOUT_MS,
  createCatch,
  markCatchPhotoUploadFailed,
  myPendingCatchesQueryKey,
  pendingCatchesQueryKey,
  updateCatchPhoto,
  uploadCatchPhotoFromUri,
} from '../catch-confirmations';
import { CAUGHT_SUITS_QUERY_KEY } from '../suits';
import { captureHandledException } from '../../lib/sentry';
import {
  loadCatchOutbox,
  removeCatchOutboxItem,
  saveCatchOutbox,
  updateCatchOutboxItem,
} from './storage';
import type { CatchOutboxItem, CatchOutboxResolution } from './types';

const MAX_BACKOFF_MS = 5 * 60 * 1000;
const RESOLVED_ITEM_TTL_MS = 60 * 1000;

let isSyncing = false;

function nowIso() {
  return new Date().toISOString();
}

function backoffMs(retryCount: number) {
  return Math.min(MAX_BACKOFF_MS, 2 ** Math.max(0, retryCount) * 5 * 1000);
}

function isRetryableError(error: unknown) {
  if (!(error instanceof Error)) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('signed in')
  );
}

function errorCodeFor(error: unknown) {
  if (!(error instanceof Error)) {
    return 'unknown_error';
  }

  const message = error.message.toLowerCase();
  if (message.includes('timed out')) return 'timeout';
  if (message.includes('network') || message.includes('failed to fetch')) return 'network_error';
  if (message.includes('signed in')) return 'auth_required';
  if (message.includes('already caught')) return 'already_caught';
  if (message.includes("couldn't find")) return 'code_not_found';
  if (message.includes('own suits')) return 'self_catch';
  if (message.includes('not catchable') || message.includes('share a playable convention')) {
    return 'shared_convention_required';
  }
  if (message.includes('cannot catch')) return 'blocked_user';
  return 'server_rejected';
}

function messageFor(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "We couldn't sync that catch. Please try again.";
}

function shouldAttempt(item: CatchOutboxItem, force: boolean) {
  if (item.status !== 'queued') {
    return false;
  }

  if (force || !item.nextAttemptAt) {
    return true;
  }

  return Date.parse(item.nextAttemptAt) <= Date.now();
}

function isPhotoUploadItem(item: CatchOutboxItem) {
  return item.method === 'camera_photo' || item.method === 'gallery_photo';
}

async function cleanupResolvedItems(userId: string) {
  const items = await loadCatchOutbox(userId);
  const cutoff = Date.now() - RESOLVED_ITEM_TTL_MS;
  const next = items.filter((item) => {
    if (item.status !== 'confirmed' && item.status !== 'pending_approval') {
      return true;
    }

    return !item.resolvedAt || Date.parse(item.resolvedAt) > cutoff;
  });

  if (next.length !== items.length) {
    await saveCatchOutbox(userId, next);
  }
}

export async function syncCatchOutbox(options: {
  userId: string | null;
  queryClient?: QueryClient;
  showToast?: (message: string) => void;
  force?: boolean;
}): Promise<CatchOutboxResolution[]> {
  const { userId, queryClient, showToast, force = false } = options;

  if (!userId || isSyncing) {
    return [];
  }

  isSyncing = true;
  const resolutions: CatchOutboxResolution[] = [];

  try {
    await cleanupResolvedItems(userId);
    const items = await loadCatchOutbox(userId);
    const candidates = items.filter((item) => shouldAttempt(item, force));

    for (const item of candidates) {
      const attemptStartedAt = nowIso();
      await updateCatchOutboxItem(userId, item.clientAttemptId, (current) => ({
        ...current,
        status: 'syncing',
        lastAttemptAt: attemptStartedAt,
        errorCode: undefined,
        errorMessage: undefined,
      }));

      try {
        if (isPhotoUploadItem(item)) {
          if (!item.catchId || !item.localPhotoUri || !item.photoSource) {
            throw new Error("We couldn't retry that photo upload. Please submit the photo again.");
          }

          const uploadResult =
            item.photoPath && item.photoUrl
              ? { photoPath: item.photoPath, photoUrl: item.photoUrl }
              : await uploadCatchPhotoFromUri({
                  userId,
                  localPhotoUri: item.localPhotoUri,
                });

          await updateCatchPhoto(item.catchId, {
            photoPath: uploadResult.photoPath,
            photoUrl: uploadResult.photoUrl,
            photoSource: item.photoSource,
          });

          const resolvedItem: CatchOutboxItem = {
            ...item,
            status: 'confirmed',
            photoPath: uploadResult.photoPath,
            photoUrl: uploadResult.photoUrl,
            lastAttemptAt: attemptStartedAt,
            resolvedAt: nowIso(),
            retryCount: item.retryCount,
            errorCode: undefined,
            errorMessage: undefined,
          };

          await updateCatchOutboxItem(userId, item.clientAttemptId, () => resolvedItem);
          resolutions.push({ item: resolvedItem, previousStatus: item.status });
          showToast?.(`Catch photo uploaded: ${resolvedItem.fursuitName ?? 'Photo catch'}`);

          if (queryClient) {
            void queryClient.invalidateQueries({ queryKey: [CAUGHT_SUITS_QUERY_KEY, userId] });
            void queryClient.invalidateQueries({ queryKey: myPendingCatchesQueryKey(userId) });
            if (item.fursuitOwnerId) {
              void queryClient.invalidateQueries({
                queryKey: pendingCatchesQueryKey(item.fursuitOwnerId),
              });
            }
          }

          continue;
        }

        const result = await createCatch({
          clientAttemptId: item.clientAttemptId,
          fursuitCode: item.fursuitCode,
          conventionId: item.conventionId ?? null,
          method: 'code',
          timeoutMs: CODE_CATCH_OUTBOX_TIMEOUT_MS,
        });

        const resolvedStatus = result.requiresApproval ? 'pending_approval' : 'confirmed';
        const resolvedItem: CatchOutboxItem = {
          ...item,
          status: resolvedStatus,
          catchId: result.catchId,
          catchNumber: result.catchNumber,
          conventionId: result.conventionId,
          fursuitId: result.fursuitId,
          fursuitName: result.fursuitName ?? item.fursuitName,
          fursuitAvatarPath: result.fursuitAvatarPath ?? item.fursuitAvatarPath,
          fursuitAvatarUrl: result.fursuitAvatarUrl ?? item.fursuitAvatarUrl,
          fursuitSpeciesName: result.fursuitSpeciesName ?? item.fursuitSpeciesName,
          lastAttemptAt: attemptStartedAt,
          resolvedAt: nowIso(),
          retryCount: item.retryCount,
          errorCode: undefined,
          errorMessage: undefined,
        };

        await updateCatchOutboxItem(userId, item.clientAttemptId, () => resolvedItem);
        resolutions.push({ item: resolvedItem, previousStatus: item.status });

        const label = resolvedItem.fursuitName ?? resolvedItem.fursuitCode ?? 'catch';
        showToast?.(
          resolvedStatus === 'pending_approval'
            ? `Catch submitted for approval: ${label}`
            : `Catch synced: ${label}`,
        );

        if (queryClient) {
          void queryClient.invalidateQueries({ queryKey: [CAUGHT_SUITS_QUERY_KEY, userId] });
          void queryClient.invalidateQueries({ queryKey: myPendingCatchesQueryKey(userId) });
        }
      } catch (error) {
        const retryCount = item.retryCount + 1;
        const retryable = isRetryableError(error);
        const failedAt = nowIso();
        const nextItem: CatchOutboxItem = retryable
          ? {
              ...item,
              status: 'queued',
              lastAttemptAt: attemptStartedAt,
              nextAttemptAt: new Date(Date.now() + backoffMs(retryCount)).toISOString(),
              retryCount,
              errorCode: errorCodeFor(error),
              errorMessage: messageFor(error),
            }
          : {
              ...item,
              status: 'failed',
              lastAttemptAt: attemptStartedAt,
              nextAttemptAt: undefined,
              resolvedAt: failedAt,
              retryCount,
              errorCode: errorCodeFor(error),
              errorMessage: messageFor(error),
            };

        await updateCatchOutboxItem(userId, item.clientAttemptId, () => nextItem);

        if (isPhotoUploadItem(item) && !retryable && item.catchId) {
          await markCatchPhotoUploadFailed(item.catchId).catch((markError) => {
            captureHandledException(markError, {
              scope: 'catch-outbox.sync.markPhotoUploadFailed',
              userId,
              catchId: item.catchId,
            });
          });
        }

        if (!retryable) {
          resolutions.push({ item: nextItem, previousStatus: item.status });
          showToast?.('Catch needs attention');
        }

        captureHandledException(error, {
          scope: 'catch-outbox.sync',
          userId,
          clientAttemptId: item.clientAttemptId,
          retryable,
        });
      }
    }
  } finally {
    isSyncing = false;
  }

  return resolutions;
}

export async function retryCatchOutboxItem(userId: string, clientAttemptId: string) {
  await updateCatchOutboxItem(userId, clientAttemptId, (item) => ({
    ...item,
    status: 'queued',
    nextAttemptAt: undefined,
    errorCode: undefined,
    errorMessage: undefined,
  }));
}

export { removeCatchOutboxItem };
