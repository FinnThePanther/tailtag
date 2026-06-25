import { Platform } from 'react-native';

import {
  markCatchPhotoUploadFailed,
  updateCatchPhoto,
  uploadCatchPhotoFromUri,
  createCatch,
  type FursuitPickerItem,
} from '@/features/catch-confirmations/api';
import type {
  CatchPhotoSource,
  CreateCatchResult,
  PhotoCatchBatchItemResult,
  PhotoCatchBatchItemStatus,
  PhotoCatchBatchResult,
} from '@/features/catch-confirmations/types';
import { catchOutboxBackoffMs, classifyCatchOutboxError } from '@/features/catch-outbox/errors';
import { upsertCatchOutboxItem, updateCatchOutboxItem } from '@/features/catch-outbox/storage';
import { captureHandledException, captureSupabaseError } from '@/lib/sentry';
import { getUserVisibleErrorMessage } from '@/lib/userVisibleErrors';
import { createCatchPerformanceTrace } from '@/features/catch-confirmations/lib/catchPerformance';
import {
  copyDurableCatchPhoto,
  deleteDurableCatchPhoto,
} from '@/features/catch-confirmations/lib/catchPhotoFiles';

const PHOTO_CATCH_BATCH_SELECTION_LIMIT = 10;

type CreatedCatch = {
  fursuit: FursuitPickerItem;
  catchResult: CreateCatchResult;
  clientAttemptId: string;
};

type PhotoUploadFailureOutcome =
  | { type: 'failed'; message: string }
  | { type: 'queued_retry'; message: string }
  | { type: 'uploaded' };

function classifyCreateCatchFailure(error: unknown): PhotoCatchBatchItemStatus {
  if (!(error instanceof Error)) {
    return 'failed';
  }

  const message = error.message.toLowerCase();
  if (message.includes('already caught') || message.includes('already caught this suit')) {
    return 'already_caught';
  }

  if (
    message.includes('not catchable') ||
    message.includes('not eligible') ||
    message.includes('share a playable convention') ||
    message.includes('gallery catches') ||
    message.includes('cannot catch') ||
    message.includes('own suits')
  ) {
    return 'not_eligible';
  }

  return 'failed';
}

function successStatus(catchResult: CreateCatchResult): 'confirmed' | 'pending_approval' {
  return catchResult.requiresApproval ? 'pending_approval' : 'confirmed';
}

function applyPhotoUploadFailureOutcome(
  result: PhotoCatchBatchItemResult | undefined,
  catchResult: CreateCatchResult,
  outcome: PhotoUploadFailureOutcome,
) {
  if (!result) {
    return;
  }

  if (outcome.type === 'queued_retry') {
    result.status = 'photo_pending';
    result.message = outcome.message;
    return;
  }

  if (outcome.type === 'uploaded') {
    result.status = successStatus(catchResult);
    result.message = undefined;
    return;
  }

  result.status = 'failed';
  result.message = outcome.message;
}

async function markPhotoUploadFailure(params: {
  userId: string;
  item: CreatedCatch;
  uploadError: unknown;
  uploadResult: { photoPath: string; photoUrl: string } | null;
}): Promise<PhotoUploadFailureOutcome> {
  const errorDetails = classifyCatchOutboxError(params.uploadError);
  const failedAt = new Date().toISOString();
  const retryMessage =
    "We couldn't upload this catch photo yet. We'll retry when your connection improves.";

  await updateCatchOutboxItem(params.userId, params.item.clientAttemptId, (outboxItem) => {
    const retryCount = outboxItem.retryCount + 1;

    if (errorDetails.retryable) {
      return {
        ...outboxItem,
        status: 'queued',
        photoPath: params.uploadResult?.photoPath ?? outboxItem.photoPath,
        photoUrl: params.uploadResult?.photoUrl ?? outboxItem.photoUrl,
        lastAttemptAt: failedAt,
        nextAttemptAt: new Date(Date.now() + catchOutboxBackoffMs(retryCount)).toISOString(),
        retryCount,
        errorCode: errorDetails.errorCode,
        errorMessage: retryMessage,
      };
    }

    return {
      ...outboxItem,
      status: 'failed',
      photoPath: params.uploadResult?.photoPath ?? outboxItem.photoPath,
      photoUrl: params.uploadResult?.photoUrl ?? outboxItem.photoUrl,
      lastAttemptAt: failedAt,
      resolvedAt: failedAt,
      retryCount,
      errorCode: errorDetails.errorCode,
      errorMessage: errorDetails.errorMessage,
    };
  });

  if (!errorDetails.retryable) {
    const markResult = await markCatchPhotoUploadFailed(params.item.catchResult.catchId).catch(
      (markError) => {
        captureHandledException(markError, {
          scope: 'catch-confirmations.photoCatchBatch.markPhotoUploadFailed',
          additionalContext: {
            userId: params.userId,
            catchId: params.item.catchResult.catchId,
            clientAttemptId: params.item.clientAttemptId,
          },
        });
        return null;
      },
    );

    if (markResult?.photoUploadState === 'uploaded') {
      await updateCatchOutboxItem(params.userId, params.item.clientAttemptId, (outboxItem) => ({
        ...outboxItem,
        status: successStatus(params.item.catchResult),
        photoPath: markResult.photoPath ?? outboxItem.photoPath,
        photoUrl: markResult.photoUrl ?? outboxItem.photoUrl,
        resolvedAt: new Date().toISOString(),
        errorCode: undefined,
        errorMessage: undefined,
      }));

      return { type: 'uploaded' };
    }
  }

  if (errorDetails.retryable) {
    return { type: 'queued_retry', message: retryMessage };
  }

  return { type: 'failed', message: errorDetails.errorMessage };
}

export async function submitPhotoCatchBatch(params: {
  userId: string;
  localPhotoUri: string;
  photoSource: CatchPhotoSource;
  conventionId: string | null;
  fursuits: FursuitPickerItem[];
  photoProcessingMs?: number | null;
}): Promise<PhotoCatchBatchResult> {
  const uniqueFursuits = [
    ...new Map(params.fursuits.map((item) => [item.id, item])).values(),
  ].slice(0, PHOTO_CATCH_BATCH_SELECTION_LIMIT);
  const batchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const batchLabel =
    uniqueFursuits.length === 1
      ? uniqueFursuits[0]?.name
      : `Group photo catch (${uniqueFursuits.length})`;
  const durablePhotoUri = await copyDurableCatchPhoto({
    userId: params.userId,
    batchId,
    sourceUri: params.localPhotoUri,
  });
  const catchMethod = params.photoSource === 'gallery' ? 'gallery_photo' : 'camera_photo';
  const results: PhotoCatchBatchItemResult[] = [];
  const createdCatches: CreatedCatch[] = [];

  for (const fursuit of uniqueFursuits) {
    const catchTrace = createCatchPerformanceTrace({ method: catchMethod });
    catchTrace.recordTiming('photo_processing_ms', params.photoProcessingMs ?? null);

    try {
      const catchResult = await createCatch({
        fursuitId: fursuit.id,
        conventionId: params.conventionId,
        clientAttemptId: catchTrace.clientAttemptId,
        method: catchMethod,
        forcePending: params.photoSource === 'gallery',
        hasPhoto: true,
        photoSource: params.photoSource,
        photoUploadState: 'pending_upload',
      });

      catchTrace.recordTiming('edge_request_ms', catchResult.edgeRequestMs);
      catchTrace.finish({
        result: catchResult.requiresApproval ? 'pending_approval' : 'success',
        catchId: catchResult.catchId,
        conventionId: params.conventionId,
      });

      const createdAt = new Date().toISOString();
      await upsertCatchOutboxItem(params.userId, {
        clientAttemptId: catchTrace.clientAttemptId,
        method: catchMethod,
        status: 'uploading',
        catchId: catchResult.catchId,
        fursuitId: fursuit.id,
        fursuitName: fursuit.name,
        fursuitAvatarUrl: fursuit.avatarUrl,
        fursuitSpeciesName: fursuit.species,
        batchId,
        batchLabel,
        conventionId: params.conventionId,
        localPhotoUri: durablePhotoUri,
        photoSource: params.photoSource,
        createdAt,
        lastAttemptAt: createdAt,
        retryCount: 0,
      });

      createdCatches.push({
        fursuit,
        catchResult,
        clientAttemptId: catchTrace.clientAttemptId,
      });
      results.push({
        fursuit,
        status: successStatus(catchResult),
        catchId: catchResult.catchId,
        catchResult,
      });
    } catch (error) {
      const caughtWithTiming = error as {
        catchPerformanceResult?: 'failed' | 'timeout';
        edgeRequestMs?: number | null;
        errorCode?: string | null;
      };
      catchTrace.recordTiming('edge_request_ms', caughtWithTiming.edgeRequestMs);
      catchTrace.finish({
        result: caughtWithTiming.catchPerformanceResult ?? 'failed',
        conventionId: params.conventionId,
        errorCode:
          caughtWithTiming.errorCode ??
          (caughtWithTiming.catchPerformanceResult === 'timeout' ? 'edge_timeout' : 'error'),
      });

      results.push({
        fursuit,
        status: classifyCreateCatchFailure(error),
        message: getUserVisibleErrorMessage(error, "We couldn't save this catch."),
      });
    }
  }

  if (createdCatches.length === 0) {
    await deleteDurableCatchPhoto(durablePhotoUri);
    // Create failures do not write outbox items, so retry only lives in this result.
    // If the user leaves, they must resubmit; the durable copy is gone and the original photo remains available.
    return {
      batchId,
      photoSource: params.photoSource,
      conventionId: params.conventionId,
      localPhotoUri: params.localPhotoUri,
      results,
    };
  }

  let uploadResult: { photoPath: string; photoUrl: string } | null = null;
  let shouldKeepDurablePhoto = false;

  try {
    uploadResult = await uploadCatchPhotoFromUri({
      userId: params.userId,
      localPhotoUri: durablePhotoUri,
    });

    for (const item of createdCatches) {
      try {
        const photoUpdateResult = await updateCatchPhoto(item.catchResult.catchId, {
          photoPath: uploadResult.photoPath,
          photoUrl: uploadResult.photoUrl,
          photoSource: params.photoSource,
        });

        if (photoUpdateResult.photoUploadState === 'failed') {
          throw new Error('Catch photo upload is not pending');
        }

        await updateCatchOutboxItem(params.userId, item.clientAttemptId, (outboxItem) => ({
          ...outboxItem,
          status: successStatus(item.catchResult),
          photoPath: photoUpdateResult.photoPath ?? uploadResult?.photoPath,
          photoUrl: photoUpdateResult.photoUrl ?? uploadResult?.photoUrl,
          resolvedAt: new Date().toISOString(),
          errorCode: undefined,
          errorMessage: undefined,
        }));
      } catch (error) {
        const photoFailureOutcome = await markPhotoUploadFailure({
          userId: params.userId,
          item,
          uploadError: error,
          uploadResult,
        });
        shouldKeepDurablePhoto =
          photoFailureOutcome.type === 'queued_retry' || shouldKeepDurablePhoto;

        const result = results.find((entry) => entry.catchId === item.catchResult.catchId);
        applyPhotoUploadFailureOutcome(result, item.catchResult, photoFailureOutcome);
      }
    }
  } catch (error) {
    if ('code' in Object(error)) {
      captureSupabaseError(error as Error, {
        scope: 'catch-confirmations.photoCatchBatch.upload',
        action: 'uploadCatchPhoto',
        additionalContext: {
          userId: params.userId,
          batchId,
          platform: Platform.OS,
        },
      });
    } else {
      captureHandledException(error, {
        scope: 'catch-confirmations.photoCatchBatch.upload',
        additionalContext: {
          userId: params.userId,
          batchId,
          platform: Platform.OS,
        },
      });
    }

    for (const item of createdCatches) {
      const photoFailureOutcome = await markPhotoUploadFailure({
        userId: params.userId,
        item,
        uploadError: error,
        uploadResult,
      });
      shouldKeepDurablePhoto =
        photoFailureOutcome.type === 'queued_retry' || shouldKeepDurablePhoto;

      const result = results.find((entry) => entry.catchId === item.catchResult.catchId);
      applyPhotoUploadFailureOutcome(result, item.catchResult, photoFailureOutcome);
    }
  }

  if (!shouldKeepDurablePhoto) {
    await deleteDurableCatchPhoto(durablePhotoUri);
  }

  // Mixed create failures also have no outbox owner. They are retryable only from this result
  // until navigation; after that, the user can start over with the original photo.
  return {
    batchId,
    photoSource: params.photoSource,
    conventionId: params.conventionId,
    localPhotoUri: durablePhotoUri,
    results,
  };
}
