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
import {
  conventionSuitRosterCaughtIdsQueryKey,
  conventionSuitRosterQueryKey,
} from '../conventions';
import { CAUGHT_COLLECTION_QUERY_KEY, CAUGHT_SUITS_QUERY_KEY } from '../suits';
import { deleteDurableCatchPhoto } from '@/features/catch-confirmations/lib/catchPhotoFiles';
import { captureHandledException } from '../../lib/sentry';
import {
  loadCatchOutbox,
  mutateCatchOutbox,
  removeCatchOutboxItem,
  updateCatchOutboxItem,
} from './storage';
import { catchOutboxBackoffMs, classifyCatchOutboxError } from './errors';
import type { CatchOutboxItem, CatchOutboxResolution } from './types';

const RESOLVED_ITEM_TTL_MS = 60 * 1000;
const PHOTO_UPLOAD_LEASE_MS = 5 * 60 * 1000;

let isSyncing = false;

function nowIso() {
  return new Date().toISOString();
}

function shouldAttempt(item: CatchOutboxItem, force: boolean) {
  if (item.status === 'uploading' && isPhotoUploadItem(item)) {
    const leaseStartedAt = Date.parse(item.lastAttemptAt ?? item.createdAt);
    return Number.isFinite(leaseStartedAt) && Date.now() - leaseStartedAt >= PHOTO_UPLOAD_LEASE_MS;
  }

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

function notifyPhotoCatchResolved(options: {
  item: CatchOutboxItem;
  userId: string;
  queryClient?: QueryClient;
  showToast?: (message: string) => void;
}) {
  const { item, userId, queryClient, showToast } = options;

  showToast?.(`Catch photo uploaded: ${item.fursuitName ?? 'Photo catch'}`);

  if (!queryClient) {
    return;
  }

  void queryClient.invalidateQueries({ queryKey: [CAUGHT_SUITS_QUERY_KEY, userId] });
  void queryClient.invalidateQueries({ queryKey: [CAUGHT_COLLECTION_QUERY_KEY, userId] });
  void queryClient.invalidateQueries({ queryKey: myPendingCatchesQueryKey(userId) });
  if (item.conventionId) {
    void queryClient.invalidateQueries({
      queryKey: conventionSuitRosterQueryKey(userId, item.conventionId),
    });
    void queryClient.invalidateQueries({
      queryKey: conventionSuitRosterCaughtIdsQueryKey(userId, item.conventionId),
    });
  }
  if (item.fursuitOwnerId) {
    void queryClient.invalidateQueries({
      queryKey: pendingCatchesQueryKey(item.fursuitOwnerId),
    });
  }
}

async function cleanupBatchPhotoIfResolved(userId: string, item: CatchOutboxItem) {
  if (!item.batchId || !item.localPhotoUri) {
    return;
  }

  const items = await loadCatchOutbox(userId);
  const hasUnresolvedBatchItem = items.some(
    (candidate) =>
      candidate.batchId === item.batchId &&
      candidate.localPhotoUri === item.localPhotoUri &&
      (candidate.status === 'queued' ||
        candidate.status === 'uploading' ||
        candidate.status === 'syncing' ||
        candidate.status === 'failed'),
  );

  if (!hasUnresolvedBatchItem) {
    await deleteDurableCatchPhoto(item.localPhotoUri);
  }
}

async function cleanupResolvedItems(userId: string) {
  const cutoff = Date.now() - RESOLVED_ITEM_TTL_MS;
  await mutateCatchOutbox(userId, (items) => {
    const next = items.filter((item) => {
      if (item.status !== 'confirmed' && item.status !== 'pending_approval') {
        return true;
      }

      return !item.resolvedAt || Date.parse(item.resolvedAt) > cutoff;
    });

    return next.length === items.length ? items : next;
  });
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

          const photoUpdateResult = await updateCatchPhoto(item.catchId, {
            photoPath: uploadResult.photoPath,
            photoUrl: uploadResult.photoUrl,
            photoSource: item.photoSource,
          });
          if (photoUpdateResult.photoUploadState === 'failed') {
            throw new Error('Catch photo upload is not pending');
          }

          const resolvedItem: CatchOutboxItem = {
            ...item,
            status: 'confirmed',
            photoPath: photoUpdateResult.photoPath ?? uploadResult.photoPath,
            photoUrl: photoUpdateResult.photoUrl ?? uploadResult.photoUrl,
            lastAttemptAt: attemptStartedAt,
            resolvedAt: nowIso(),
            retryCount: item.retryCount,
            errorCode: undefined,
            errorMessage: undefined,
          };

          await updateCatchOutboxItem(userId, item.clientAttemptId, () => resolvedItem);
          resolutions.push({ item: resolvedItem, previousStatus: item.status });
          notifyPhotoCatchResolved({ item: resolvedItem, userId, queryClient, showToast });
          await cleanupBatchPhotoIfResolved(userId, resolvedItem);

          continue;
        }

        const result = await createCatch({
          clientAttemptId: item.clientAttemptId,
          fursuitCode: item.fursuitCode,
          conventionId: item.conventionId ?? null,
          method: 'code',
          timeoutMs: CODE_CATCH_OUTBOX_TIMEOUT_MS,
          reciprocalFursuitId: item.reciprocalFursuitId ?? null,
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
          void queryClient.invalidateQueries({
            queryKey: [CAUGHT_COLLECTION_QUERY_KEY, userId],
          });
          void queryClient.invalidateQueries({ queryKey: myPendingCatchesQueryKey(userId) });
          if (resolvedItem.conventionId) {
            void queryClient.invalidateQueries({
              queryKey: conventionSuitRosterQueryKey(userId, resolvedItem.conventionId),
            });
            void queryClient.invalidateQueries({
              queryKey: conventionSuitRosterCaughtIdsQueryKey(userId, resolvedItem.conventionId),
            });
          }
        }
      } catch (error) {
        const retryCount = item.retryCount + 1;
        const errorDetails = classifyCatchOutboxError(error);
        const failedAt = nowIso();
        const nextItem: CatchOutboxItem = errorDetails.retryable
          ? {
              ...item,
              status: 'queued',
              lastAttemptAt: attemptStartedAt,
              nextAttemptAt: new Date(Date.now() + catchOutboxBackoffMs(retryCount)).toISOString(),
              retryCount,
              errorCode: errorDetails.errorCode,
              errorMessage: errorDetails.errorMessage,
            }
          : {
              ...item,
              status: 'failed',
              lastAttemptAt: attemptStartedAt,
              nextAttemptAt: undefined,
              resolvedAt: failedAt,
              retryCount,
              errorCode: errorDetails.errorCode,
              errorMessage: errorDetails.errorMessage,
            };

        await updateCatchOutboxItem(userId, item.clientAttemptId, () => nextItem);

        if (isPhotoUploadItem(item) && !errorDetails.retryable && item.catchId) {
          const markResult = await markCatchPhotoUploadFailed(item.catchId).catch((markError) => {
            captureHandledException(markError, {
              scope: 'catch-outbox.sync.markPhotoUploadFailed',
              additionalContext: {
                userId,
                catchId: item.catchId,
              },
            });
            return null;
          });

          if (markResult?.photoUploadState === 'uploaded') {
            const confirmedItem: CatchOutboxItem = {
              ...item,
              status: 'confirmed',
              photoPath: markResult.photoPath ?? item.photoPath,
              photoUrl: markResult.photoUrl ?? item.photoUrl,
              lastAttemptAt: attemptStartedAt,
              resolvedAt: failedAt,
              retryCount,
              errorCode: undefined,
              errorMessage: undefined,
            };
            await updateCatchOutboxItem(userId, item.clientAttemptId, () => confirmedItem);
            resolutions.push({ item: confirmedItem, previousStatus: item.status });
            notifyPhotoCatchResolved({ item: confirmedItem, userId, queryClient, showToast });
            await cleanupBatchPhotoIfResolved(userId, confirmedItem);
            continue;
          }
        }

        if (!errorDetails.retryable) {
          resolutions.push({ item: nextItem, previousStatus: item.status });
          showToast?.('Catch needs attention');
        }

        captureHandledException(error, {
          scope: 'catch-outbox.sync',
          additionalContext: {
            userId,
            clientAttemptId: item.clientAttemptId,
            retryable: errorDetails.retryable,
          },
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
