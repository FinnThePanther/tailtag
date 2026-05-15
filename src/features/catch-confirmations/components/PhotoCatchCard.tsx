import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagCard } from '../../../components/ui/TailTagCard';
import { captureHandledException, captureSupabaseError } from '../../../lib/sentry';
import { colors } from '../../../theme';
import { processImageForUpload, IMAGE_UPLOAD_PRESETS } from '../../../utils/images';
import { updateCatchOutboxItem, upsertCatchOutboxItem } from '@/features/catch-outbox/storage';
import { catchOutboxBackoffMs, classifyCatchOutboxError } from '@/features/catch-outbox/errors';
import {
  createCatch,
  fetchConventionFursuits,
  markCatchPhotoUploadFailed,
  updateCatchPhoto,
  uploadCatchPhotoFromUri,
} from '@/features/catch-confirmations/api/confirmations';
import { createCatchPerformanceTrace } from '../lib/catchPerformance';
import {
  fetchActiveSharedConventionIds,
  fetchGalleryProfileConventionIds,
  fetchGallerySharedConventionIds,
} from '../../conventions';
import { FursuitPicker } from './FursuitPicker';
import type { FursuitPickerItem } from '../api';
import type { CatchPhotoSource, CreateCatchResult } from '../types';
import { styles } from './PhotoCatchCard.styles';

type PhotoCandidate = {
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
};

type PhotoCatchCardProps = {
  userId: string;
  onCatchSubmit: (params: {
    fursuitId: string;
    conventionId: string | null;
    catchResult: CreateCatchResult;
  }) => Promise<void>;
  isSubmitting?: boolean;
  disabled?: boolean;
  submitError?: string | null;
  activeConventionIds?: string[];
  preloadedFursuits?: FursuitPickerItem[];
  isRosterRefreshing?: boolean;
};

type Step = 'idle' | 'photo_taken' | 'fursuit_selected';

const isSupabaseError = (
  error: unknown,
): error is { code?: string; details?: string; hint?: string; message?: string } =>
  typeof error === 'object' &&
  error !== null &&
  ('code' in error || 'details' in error || 'hint' in error);

async function safeUpdateCatchOutboxItem(
  userId: string,
  clientAttemptId: string,
  updater: Parameters<typeof updateCatchOutboxItem>[2],
) {
  try {
    await updateCatchOutboxItem(userId, clientAttemptId, updater);
  } catch (error) {
    captureHandledException(error, {
      scope: 'catch-confirmations.PhotoCatchCard.updateCatchOutboxItem',
      additionalContext: {
        userId,
        clientAttemptId,
      },
    });
    return null;
  }

  return null;
}

export function PhotoCatchCard({
  userId,
  onCatchSubmit,
  isSubmitting = false,
  disabled = false,
  submitError,
  activeConventionIds = [],
  preloadedFursuits = [],
  isRosterRefreshing = false,
}: PhotoCatchCardProps) {
  const [step, setStep] = useState<Step>('idle');
  const [photo, setPhoto] = useState<PhotoCandidate | null>(null);
  const [photoSource, setPhotoSource] = useState<CatchPhotoSource | null>(null);
  const [selectedFursuit, setSelectedFursuit] = useState<FursuitPickerItem | null>(null);
  const [fursuits, setFursuits] = useState<FursuitPickerItem[]>([]);
  const [conventionIds, setConventionIds] = useState<string[]>([]);
  const [isLoadingFursuits, setIsLoadingFursuits] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoProcessingMs, setPhotoProcessingMs] = useState<number | null>(null);

  // Load convention fursuits when photo is taken
  useEffect(() => {
    if (step !== 'photo_taken') return;
    if (conventionIds.length === 0) {
      setFursuits([]);
      setIsLoadingFursuits(false);
      return;
    }

    if (photoSource !== 'gallery' && preloadedFursuits.length > 0) {
      setFursuits(preloadedFursuits);
      setIsLoadingFursuits(false);
      return;
    }

    setIsLoadingFursuits(true);
    fetchConventionFursuits(conventionIds, userId)
      .then(setFursuits)
      .catch(() => setLocalError("Couldn't load fursuits. Please try again."))
      .finally(() => setIsLoadingFursuits(false));
  }, [step, conventionIds, photoSource, preloadedFursuits, userId]);

  const handleTakePhoto = async () => {
    if (disabled) return;

    setLocalError(null);

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setLocalError('Camera permission is required to take a photo. Please enable it in Settings.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      cameraType: ImagePicker.CameraType.front,
      quality: 1.0,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];

    setIsProcessingPhoto(true);
    setLocalError(null);
    setFursuits([]);
    try {
      const processingStartedAt = Date.now();
      const processed = await processImageForUpload(asset.uri, {
        ...IMAGE_UPLOAD_PRESETS.catchPhoto,
        flipHorizontal: true,
      });
      setPhotoProcessingMs(Math.max(0, Date.now() - processingStartedAt));
      setPhoto({
        uri: processed.uri,
        mimeType: 'image/jpeg',
        fileName: `catch-${Date.now()}.jpg`,
        fileSize: 0,
      });
      setPhotoSource('camera');
      setConventionIds(activeConventionIds);
      setFursuits(preloadedFursuits);
      setStep('photo_taken');
      setSelectedFursuit(null);
    } catch {
      setPhotoProcessingMs(null);
      setLocalError("We couldn't process your photo. Please try again.");
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleChooseGalleryPhoto = async () => {
    if (disabled) return;

    setLocalError(null);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setLocalError('Photo library permission is required to choose a catch photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 1.0,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];

    setIsProcessingPhoto(true);
    setLocalError(null);
    setFursuits([]);
    try {
      const processingStartedAt = Date.now();
      const processed = await processImageForUpload(asset.uri, IMAGE_UPLOAD_PRESETS.catchPhoto);
      setPhotoProcessingMs(Math.max(0, Date.now() - processingStartedAt));
      const galleryConventionIds = await fetchGalleryProfileConventionIds(userId);
      setPhoto({
        uri: processed.uri,
        mimeType: 'image/jpeg',
        fileName: `catch-${Date.now()}.jpg`,
        fileSize: 0,
      });
      setPhotoSource('gallery');
      setConventionIds(galleryConventionIds);
      setIsLoadingFursuits(true);
      setStep('photo_taken');
      setSelectedFursuit(null);
    } catch {
      setPhotoProcessingMs(null);
      setLocalError("We couldn't process that gallery photo. Please try another.");
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleRetakePhoto = () => {
    if (disabled) return;

    setPhoto(null);
    setPhotoSource(null);
    setPhotoProcessingMs(null);
    setSelectedFursuit(null);
    setFursuits([]);
    setStep('idle');
    setLocalError(null);
  };

  const handleSelectFursuit = (item: FursuitPickerItem) => {
    if (disabled) return;

    setSelectedFursuit((prev) => (prev?.id === item.id ? null : item));
  };

  const handleSubmit = async () => {
    if (disabled || !photo || !selectedFursuit) return;
    setLocalError(null);
    setIsUploadingPhoto(true);
    const catchMethod = photoSource === 'gallery' ? 'gallery_photo' : 'camera_photo';
    const localPhotoUri = photo.uri;
    const catchTrace = createCatchPerformanceTrace({ method: catchMethod });
    let catchTraceFinished = false;
    const finishCatchTrace = (options: {
      result: 'success' | 'pending_approval' | 'failed' | 'timeout';
      catchId?: string | null;
      conventionId?: string | null;
      errorCode?: string | null;
    }) => {
      if (catchTraceFinished) {
        return;
      }
      catchTraceFinished = true;
      catchTrace.finish(options);
    };
    catchTrace.recordTiming('photo_processing_ms', photoProcessingMs);

    // Step 1: Validate shared convention before doing any uploads
    let sharedConventionId: string | null = null;

    try {
      const sharedConventionIds = await catchTrace.measure('shared_conventions_ms', () =>
        photoSource === 'gallery'
          ? fetchGallerySharedConventionIds(userId, selectedFursuit.id)
          : fetchActiveSharedConventionIds(userId, selectedFursuit.id),
      );
      sharedConventionId = sharedConventionIds[0] ?? null;

      if (!sharedConventionId) {
        setLocalError(
          photoSource === 'gallery'
            ? 'This suit is not eligible for a gallery catch at your convention. Both players must share the event, and the fursuit must be listed there within the post-convention gallery window.'
            : 'This suit is not catchable at your playable convention yet. Both players must be Ready to catch for the same live event, and the fursuit owner must list that specific suit for the event.',
        );
        setIsUploadingPhoto(false);
        finishCatchTrace({ result: 'failed', errorCode: 'no_shared_convention' });
        return;
      }
    } catch {
      setLocalError("Couldn't verify convention. Please try again.");
      setIsUploadingPhoto(false);
      finishCatchTrace({ result: 'failed', errorCode: 'shared_convention_check_failed' });
      return;
    }

    // Step 2: Create the catch first. The photo upload is retried through the local outbox.
    let catchResult: CreateCatchResult;
    try {
      catchResult = await createCatch({
        fursuitId: selectedFursuit.id,
        conventionId: sharedConventionId,
        clientAttemptId: catchTrace.clientAttemptId,
        method: catchMethod,
        isTutorial: false,
        forcePending: photoSource === 'gallery',
        hasPhoto: true,
        photoSource,
        photoUploadState: 'pending_upload',
      });
      catchTrace.recordTiming('edge_request_ms', catchResult.edgeRequestMs);
      await upsertCatchOutboxItem(userId, {
        clientAttemptId: catchTrace.clientAttemptId,
        method: catchMethod,
        status: 'queued',
        catchId: catchResult.catchId,
        fursuitId: selectedFursuit.id,
        fursuitOwnerId: catchResult.fursuitOwnerId,
        fursuitName: selectedFursuit.name,
        conventionId: sharedConventionId,
        localPhotoUri,
        photoSource: photoSource ?? 'camera',
        createdAt: new Date().toISOString(),
        retryCount: 0,
      });
    } catch (error) {
      const caughtWithTiming = error as {
        catchPerformanceResult?: 'failed' | 'timeout';
        edgeRequestMs?: number | null;
      };
      catchTrace.recordTiming('edge_request_ms', caughtWithTiming.edgeRequestMs);
      setLocalError(
        error instanceof Error ? error.message : "Couldn't create catch. Please try again.",
      );
      setIsUploadingPhoto(false);
      finishCatchTrace({
        result: caughtWithTiming.catchPerformanceResult ?? 'failed',
        conventionId: sharedConventionId,
        errorCode: caughtWithTiming.catchPerformanceResult === 'timeout' ? 'edge_timeout' : 'error',
      });
      return;
    }

    setIsUploadingPhoto(false);

    const stopPostCreateRenderTiming = catchTrace.startTiming('post_create_render_ms');
    await onCatchSubmit({
      fursuitId: selectedFursuit.id,
      conventionId: sharedConventionId,
      catchResult,
    });
    stopPostCreateRenderTiming();

    setPhoto(null);
    setPhotoSource(null);
    setPhotoProcessingMs(null);
    setSelectedFursuit(null);
    setFursuits([]);
    setStep('idle');

    finishCatchTrace({
      result: catchResult.requiresApproval ? 'pending_approval' : 'success',
      catchId: catchResult.catchId,
      conventionId: sharedConventionId,
    });

    let uploadResult: { photoPath: string; photoUrl: string } | null = null;
    try {
      uploadResult = await catchTrace.measure('photo_upload_ms', () =>
        uploadCatchPhotoFromUri({
          userId,
          localPhotoUri,
        }),
      );
      await updateCatchPhoto(catchResult.catchId, {
        photoPath: uploadResult.photoPath,
        photoUrl: uploadResult.photoUrl,
        photoSource: photoSource ?? 'camera',
      });
      const confirmedUploadResult = uploadResult;
      await updateCatchOutboxItem(userId, catchTrace.clientAttemptId, (item) => ({
        ...item,
        status: 'confirmed',
        photoPath: confirmedUploadResult.photoPath,
        photoUrl: confirmedUploadResult.photoUrl,
        resolvedAt: new Date().toISOString(),
        errorCode: undefined,
        errorMessage: undefined,
      }));
    } catch (error) {
      const uploadContext = {
        clientAttemptId: catchTrace.clientAttemptId,
        catchId: catchResult.catchId,
        userId,
        photoSource: photoSource ?? 'camera',
      };

      if (isSupabaseError(error)) {
        captureSupabaseError(error, {
          scope: 'catch-confirmations.PhotoCatchCard.uploadCatchPhoto',
          action: 'uploadCatchPhoto',
          additionalContext: uploadContext,
        });
      } else {
        captureHandledException(error, {
          scope: 'catch-confirmations.PhotoCatchCard.uploadCatchPhoto',
          additionalContext: uploadContext,
        });
      }

      const errorDetails = classifyCatchOutboxError(error);
      const failedAt = new Date().toISOString();
      await safeUpdateCatchOutboxItem(userId, catchTrace.clientAttemptId, (item) => {
        const retryCount = item.retryCount + 1;

        if (errorDetails.retryable) {
          return {
            ...item,
            status: 'queued',
            photoPath: uploadResult?.photoPath ?? item.photoPath,
            photoUrl: uploadResult?.photoUrl ?? item.photoUrl,
            lastAttemptAt: failedAt,
            nextAttemptAt: new Date(Date.now() + catchOutboxBackoffMs(retryCount)).toISOString(),
            retryCount,
            errorCode: errorDetails.errorCode,
            errorMessage:
              "We couldn't upload this catch photo yet. We'll retry when your connection improves.",
          };
        }

        return {
          ...item,
          status: 'failed',
          photoPath: uploadResult?.photoPath ?? item.photoPath,
          photoUrl: uploadResult?.photoUrl ?? item.photoUrl,
          lastAttemptAt: failedAt,
          resolvedAt: failedAt,
          retryCount,
          errorCode: errorDetails.errorCode,
          errorMessage: errorDetails.errorMessage,
        };
      });

      if (!errorDetails.retryable) {
        await markCatchPhotoUploadFailed(catchResult.catchId).catch((markError) => {
          captureHandledException(markError, {
            scope: 'catch-confirmations.PhotoCatchCard.markPhotoUploadFailed',
            additionalContext: {
              userId,
              catchId: catchResult.catchId,
              clientAttemptId: catchTrace.clientAttemptId,
            },
          });
        });
      }

      setLocalError(
        errorDetails.retryable
          ? "Catch saved. We'll retry the photo upload when your connection improves."
          : 'Catch saved. Photo upload needs attention and can be retried below.',
      );
    }
  };

  const canSubmit =
    Boolean(photo) && Boolean(selectedFursuit) && !disabled && !isSubmitting && !isUploadingPhoto;
  const isBusy = isSubmitting || isUploadingPhoto;

  return (
    <TailTagCard style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons
          name="camera"
          size={20}
          color={colors.primary}
        />
        <Text style={styles.title}>Photo Catch</Text>
      </View>
      <Text style={styles.subtitle}>Take or choose a photo with a fursuiter to log the catch.</Text>

      {step === 'idle' ? (
        isProcessingPhoto ? (
          <View style={styles.processingContainer}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.processingText}>Processing photo…</Text>
          </View>
        ) : (
          <View style={styles.entryActions}>
            <TailTagButton
              variant="outline"
              onPress={handleTakePhoto}
              disabled={disabled}
              style={styles.cameraButton}
            >
              <View style={styles.buttonContent}>
                <Ionicons
                  name="camera-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text style={styles.cameraButtonText}>Open Camera</Text>
              </View>
            </TailTagButton>
            <TailTagButton
              variant="outline"
              onPress={handleChooseGalleryPhoto}
              disabled={disabled}
              style={styles.cameraButton}
            >
              <View style={styles.buttonContent}>
                <Ionicons
                  name="images-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text style={styles.cameraButtonText}>Choose from Gallery</Text>
              </View>
            </TailTagButton>
          </View>
        )
      ) : (
        <>
          {/* Photo preview */}
          <View style={styles.previewRow}>
            <Image
              source={photo!.uri}
              style={styles.photoPreview}
              contentFit="cover"
            />
            <View style={styles.previewActions}>
              <Text style={styles.previewLabel}>
                {photoSource === 'gallery' ? 'Gallery photo selected' : 'Selfie taken'}
              </Text>
              {photoSource === 'gallery' ? (
                <Text style={styles.previewHint}>Sent for approval before it counts.</Text>
              ) : null}
              <Pressable
                onPress={handleRetakePhoto}
                disabled={disabled}
                style={styles.retakeButton}
              >
                <Ionicons
                  name="refresh-outline"
                  size={14}
                  color="rgba(148,163,184,0.8)"
                />
                <Text style={styles.retakeText}>Retake</Text>
              </Pressable>
            </View>
          </View>

          {/* Fursuit picker */}
          <View style={styles.pickerSection}>
            <Text style={styles.pickerLabel}>Which fursuit did you catch?</Text>
            {photoSource !== 'gallery' && fursuits.length > 0 && isRosterRefreshing ? (
              <Text style={styles.previewHint}>Refreshing roster…</Text>
            ) : null}
            <ScrollView
              nestedScrollEnabled
              style={styles.pickerScroll}
              showsVerticalScrollIndicator={false}
            >
              <FursuitPicker
                items={fursuits}
                selectedId={selectedFursuit?.id ?? null}
                onSelect={handleSelectFursuit}
                isLoading={isLoadingFursuits}
                disabled={disabled}
              />
            </ScrollView>
          </View>
        </>
      )}

      {(localError ?? submitError) ? (
        <View style={styles.errorContainer}>
          <Ionicons
            name="alert-circle"
            size={18}
            color="#f87171"
          />
          <Text style={styles.errorText}>{localError ?? submitError}</Text>
        </View>
      ) : null}

      {step !== 'idle' && (
        <TailTagButton
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={isBusy}
          style={styles.submitButton}
        >
          {isUploadingPhoto ? 'Saving catch…' : 'Submit Catch'}
        </TailTagButton>
      )}

      <View style={styles.infoRow}>
        <Ionicons
          name="information-circle-outline"
          size={14}
          color="rgba(148,163,184,0.6)"
        />
        <Text style={styles.infoText}>
          Camera catches follow the fursuiter&apos;s approval setting. Gallery catches always need
          approval.
        </Text>
      </View>
    </TailTagCard>
  );
}
