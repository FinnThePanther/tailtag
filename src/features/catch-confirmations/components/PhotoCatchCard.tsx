import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { TailTagButton } from '@/components/ui/TailTagButton';
import { TailTagCard } from '@/components/ui/TailTagCard';
import { captureHandledException } from '@/lib/sentry';
import { getUserVisibleErrorMessage } from '@/lib/userVisibleErrors';
import { colors } from '@/theme';
import { processImageForUpload, IMAGE_UPLOAD_PRESETS } from '@/utils/images';
import { fetchConventionFursuits } from '@/features/catch-confirmations/api/confirmations';
import { submitPhotoCatchBatch } from '@/features/catch-confirmations/lib/photoCatchBatch';
import { fetchGalleryProfileConventionIds } from '@/features/conventions';
import { FursuitPicker } from '@/features/catch-confirmations/components/FursuitPicker';
import type { FursuitPickerItem } from '@/features/catch-confirmations/api';
import type { CatchPhotoSource, PhotoCatchBatchResult } from '@/features/catch-confirmations/types';
import { styles } from '@/features/catch-confirmations/components/PhotoCatchCard.styles';

const PHOTO_CATCH_SELECTION_LIMIT = 10;

type PhotoCandidate = {
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
};

type ConventionOption = {
  id: string;
  name: string;
};

type PhotoCatchCardProps = {
  userId: string;
  onCatchSubmit: (result: PhotoCatchBatchResult) => Promise<void>;
  onInviteSubmit?: (params: {
    localPhotoUri: string;
    photoSource: CatchPhotoSource;
    conventionId: string | null;
  }) => Promise<void>;
  isSubmitting?: boolean;
  disabled?: boolean;
  submitError?: string | null;
  activeConventionIds?: string[];
  activeConventionId?: string | null;
  conventionOptions?: ConventionOption[];
  preloadedFursuits?: FursuitPickerItem[];
  isRosterRefreshing?: boolean;
  catchUnavailableReason?: string | null;
};

type Step = 'idle' | 'photo_taken';

export function PhotoCatchCard({
  userId,
  onCatchSubmit,
  onInviteSubmit,
  isSubmitting = false,
  disabled = false,
  submitError,
  activeConventionIds = [],
  activeConventionId = null,
  conventionOptions = [],
  preloadedFursuits = [],
  isRosterRefreshing = false,
  catchUnavailableReason = null,
}: PhotoCatchCardProps) {
  const [step, setStep] = useState<Step>('idle');
  const [photo, setPhoto] = useState<PhotoCandidate | null>(null);
  const [photoSource, setPhotoSource] = useState<CatchPhotoSource | null>(null);
  const [selectedFursuits, setSelectedFursuits] = useState<Map<string, FursuitPickerItem>>(
    () => new Map(),
  );
  const [fursuits, setFursuits] = useState<FursuitPickerItem[]>([]);
  const [conventionIds, setConventionIds] = useState<string[]>([]);
  const [selectedConventionId, setSelectedConventionId] = useState<string | null>(null);
  const [isLoadingFursuits, setIsLoadingFursuits] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [permissionRecoveryLabel, setPermissionRecoveryLabel] = useState<string | null>(null);
  const [pickerAction, setPickerAction] = useState<CatchPhotoSource | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [photoProcessingMs, setPhotoProcessingMs] = useState<number | null>(null);

  const conventionOptionsById = useMemo(
    () => new Map(conventionOptions.map((option) => [option.id, option])),
    [conventionOptions],
  );
  const availableConventionOptions = useMemo(
    () =>
      conventionIds.map((id) => ({
        id,
        name: conventionOptionsById.get(id)?.name ?? `Convention ${id.slice(0, 8)}`,
      })),
    [conventionIds, conventionOptionsById],
  );
  const selectedFursuitList = useMemo(() => [...selectedFursuits.values()], [selectedFursuits]);
  const selectedFursuitIds = useMemo(() => [...selectedFursuits.keys()], [selectedFursuits]);
  const needsConventionSelection =
    step === 'photo_taken' && availableConventionOptions.length > 1 && !selectedConventionId;

  useEffect(() => {
    if (step !== 'photo_taken') return;

    if (availableConventionOptions.length === 1 && !selectedConventionId) {
      setSelectedConventionId(availableConventionOptions[0].id);
      return;
    }

    if (availableConventionOptions.length > 1 && !selectedConventionId) {
      setFursuits([]);
      setIsLoadingFursuits(false);
      return;
    }

    if (conventionIds.length === 0) {
      setFursuits([]);
      setIsLoadingFursuits(false);
      return;
    }

    const fursuitConventionIds = selectedConventionId ? [selectedConventionId] : conventionIds;
    const canUsePreloadedRoster =
      photoSource !== 'gallery' &&
      preloadedFursuits.length > 0 &&
      fursuitConventionIds.length === activeConventionIds.length;

    if (canUsePreloadedRoster) {
      setFursuits(preloadedFursuits);
      setIsLoadingFursuits(false);
      return;
    }

    const controller = new AbortController();

    setIsLoadingFursuits(true);
    fetchConventionFursuits(fursuitConventionIds, userId, controller.signal)
      .then((nextFursuits) => {
        if (!controller.signal.aborted) {
          setFursuits(nextFursuits);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLocalError("Couldn't load fursuits. Please try again.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingFursuits(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    activeConventionIds.length,
    availableConventionOptions,
    conventionIds,
    photoSource,
    preloadedFursuits,
    selectedConventionId,
    step,
    userId,
  ]);

  const areEntryActionsDisabled = disabled || isSubmitting || isUploadingPhoto || isCreatingInvite;

  const resetPickerFeedback = () => {
    setLocalError(null);
    setPermissionRecoveryLabel(null);
  };

  const showCatchUnavailableReason = () => {
    if (!catchUnavailableReason) {
      return false;
    }

    setLocalError(catchUnavailableReason);
    setPermissionRecoveryLabel(null);
    return true;
  };

  const resetPhotoState = () => {
    setPhoto(null);
    setPhotoSource(null);
    setPhotoProcessingMs(null);
    setSelectedFursuits(new Map());
    setFursuits([]);
    setConventionIds([]);
    setSelectedConventionId(null);
    setStep('idle');
  };

  const handleTakePhoto = async () => {
    if (areEntryActionsDisabled || pickerAction || isProcessingPhoto) return;
    if (showCatchUnavailableReason()) return;

    resetPickerFeedback();

    let result: ImagePicker.ImagePickerResult;
    setPickerAction('camera');
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setLocalError(
          permission.canAskAgain
            ? 'Camera permission is required to take a catch photo. Please allow camera access when prompted.'
            : 'Camera access is disabled. Enable camera access in Settings to take a catch photo.',
        );
        setPermissionRecoveryLabel(permission.canAskAgain ? null : 'Open Settings');
        return;
      }

      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        cameraType: ImagePicker.CameraType.front,
        quality: 1.0,
        presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
      });
    } catch (error) {
      captureHandledException(error, {
        scope: 'catch-confirmations.PhotoCatchCard.handleTakePhoto',
        userId,
      });
      setLocalError("We couldn't open the camera. Please try again.");
      return;
    } finally {
      setPickerAction(null);
    }

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];

    setIsProcessingPhoto(true);
    resetPickerFeedback();
    setFursuits([]);
    try {
      const processingStartedAt = Date.now();
      const processed = await processImageForUpload(asset.uri, IMAGE_UPLOAD_PRESETS.catchPhoto);
      setPhotoProcessingMs(Math.max(0, Date.now() - processingStartedAt));
      setPhoto({
        uri: processed.uri,
        mimeType: 'image/jpeg',
        fileName: `catch-${Date.now()}.jpg`,
        fileSize: 0,
      });
      setPhotoSource('camera');
      setConventionIds(activeConventionIds);
      setSelectedConventionId(activeConventionIds.length === 1 ? activeConventionIds[0] : null);
      setFursuits(activeConventionIds.length === 1 ? preloadedFursuits : []);
      setSelectedFursuits(new Map());
      setStep('photo_taken');
    } catch {
      setPhotoProcessingMs(null);
      setLocalError("We couldn't process your photo. Please try again.");
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleChooseGalleryPhoto = async () => {
    if (areEntryActionsDisabled || pickerAction || isProcessingPhoto) return;
    if (showCatchUnavailableReason()) return;

    resetPickerFeedback();

    const permission = await ImagePicker.getMediaLibraryPermissionsAsync().catch((error) => {
      captureHandledException(error, {
        scope: 'catch-confirmations.PhotoCatchCard.getMediaLibraryPermissions',
        userId,
      });
      return null;
    });

    let result: ImagePicker.ImagePickerResult;
    setPickerAction('gallery');
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1.0,
        presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
      });
    } catch (error) {
      captureHandledException(error, {
        scope: 'catch-confirmations.PhotoCatchCard.handleChooseGalleryPhoto',
        userId,
        additionalContext: {
          mediaLibraryStatus: permission?.status ?? null,
          mediaLibraryAccessPrivileges: permission?.accessPrivileges ?? null,
        },
      });
      setLocalError(
        permission?.status === 'denied' && !permission.canAskAgain
          ? 'Photo library access is disabled. Enable photo access in Settings or try again from the system picker.'
          : "We couldn't open your photo library. Please try again.",
      );
      setPermissionRecoveryLabel(
        permission?.status === 'denied' && !permission.canAskAgain ? 'Open Settings' : null,
      );
      return;
    } finally {
      setPickerAction(null);
    }

    if (result.canceled || !result.assets[0]) {
      if (permission?.accessPrivileges === 'limited') {
        setLocalError(
          'Only selected photos are available. Use Settings to allow more photos if the one you need is missing.',
        );
        setPermissionRecoveryLabel('Open Settings');
      }
      return;
    }

    const asset = result.assets[0];

    setIsProcessingPhoto(true);
    resetPickerFeedback();
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
      setSelectedConventionId(
        galleryConventionIds.length === 1
          ? galleryConventionIds[0]
          : activeConventionId && galleryConventionIds.includes(activeConventionId)
            ? activeConventionId
            : null,
      );
      setIsLoadingFursuits(true);
      setSelectedFursuits(new Map());
      setStep('photo_taken');
    } catch {
      setPhotoProcessingMs(null);
      setLocalError("We couldn't process that gallery photo. Please try another.");
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleRetakePhoto = () => {
    if (disabled) return;

    resetPhotoState();
    resetPickerFeedback();
  };

  const handleSelectFursuit = (item: FursuitPickerItem) => {
    if (disabled) return;

    setSelectedFursuits((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
        return next;
      }
      if (next.size >= PHOTO_CATCH_SELECTION_LIMIT) {
        return prev;
      }
      next.set(item.id, item);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (
      disabled ||
      !photo ||
      !photoSource ||
      !selectedConventionId ||
      selectedFursuitList.length === 0
    ) {
      return;
    }

    setLocalError(null);
    setIsUploadingPhoto(true);

    try {
      const batchResult = await submitPhotoCatchBatch({
        userId,
        localPhotoUri: photo.uri,
        photoSource,
        conventionId: selectedConventionId,
        fursuits: selectedFursuitList,
        photoProcessingMs,
      });

      await onCatchSubmit(batchResult);
      resetPhotoState();
    } catch (error) {
      setLocalError(
        getUserVisibleErrorMessage(error, "Couldn't submit catches. Please try again."),
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleInviteSubmit = async () => {
    if (disabled || !photo || !photoSource || !onInviteSubmit || isCreatingInvite) {
      return;
    }

    const inviteConventionId = selectedConventionId ?? activeConventionId;

    if (!inviteConventionId || !conventionIds.includes(inviteConventionId)) {
      setLocalError('Select one active convention before creating an invite catch.');
      return;
    }

    setLocalError(null);
    setIsCreatingInvite(true);
    try {
      await onInviteSubmit({
        localPhotoUri: photo.uri,
        photoSource,
        conventionId: inviteConventionId,
      });

      resetPhotoState();
    } catch (error) {
      setLocalError(
        getUserVisibleErrorMessage(error, "We couldn't create that invite. Please try again."),
      );
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const canSubmit =
    Boolean(photo) &&
    Boolean(selectedConventionId) &&
    selectedFursuitList.length > 0 &&
    !disabled &&
    !isSubmitting &&
    !isUploadingPhoto;
  const isOpeningCamera = pickerAction === 'camera';
  const isOpeningGallery = pickerAction === 'gallery';

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
      <Text style={styles.subtitle}>
        Take a photo now, or choose one from your gallery later. No catch code is needed for photo
        catches.
      </Text>

      {step === 'idle' ? (
        isProcessingPhoto || pickerAction ? (
          <View style={styles.processingContainer}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.processingText}>
              {isProcessingPhoto
                ? 'Processing photo...'
                : isOpeningCamera
                  ? 'Opening camera...'
                  : 'Opening gallery...'}
            </Text>
          </View>
        ) : (
          <View style={styles.entryActions}>
            <TailTagButton
              variant="outline"
              onPress={handleTakePhoto}
              disabled={areEntryActionsDisabled}
              loading={isOpeningCamera}
              style={styles.cameraButton}
              accessibilityLabel="Open camera"
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
              disabled={areEntryActionsDisabled}
              loading={isOpeningGallery}
              style={styles.cameraButton}
              accessibilityLabel="Choose from Gallery"
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
          <View style={styles.previewRow}>
            <Image
              source={photo!.uri}
              style={styles.photoPreview}
              contentFit="cover"
            />
            <View style={styles.previewActions}>
              <Text style={styles.previewLabel}>
                {photoSource === 'gallery' ? 'Gallery photo selected' : 'Photo taken'}
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

          <View style={styles.pickerSection}>
            {availableConventionOptions.length > 1 ? (
              <View style={styles.conventionSection}>
                <Text style={styles.pickerLabel}>Which convention is this for?</Text>
                <View style={styles.conventionOptions}>
                  {availableConventionOptions.map((option) => {
                    const isSelected = option.id === selectedConventionId;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => {
                          setSelectedConventionId(option.id);
                          setSelectedFursuits(new Map());
                          setLocalError(null);
                        }}
                        style={[
                          styles.conventionOption,
                          isSelected && styles.conventionOptionSelected,
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isSelected }}
                      >
                        <Text
                          style={[
                            styles.conventionOptionText,
                            isSelected && styles.conventionOptionTextSelected,
                          ]}
                        >
                          {option.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
            <Text style={styles.pickerLabel}>
              {needsConventionSelection
                ? 'Choose a convention before selecting suits'
                : `Which fursuits did you catch? (${selectedFursuitList.length}/${PHOTO_CATCH_SELECTION_LIMIT})`}
            </Text>
            {photoSource !== 'gallery' && fursuits.length > 0 && isRosterRefreshing ? (
              <Text style={styles.previewHint}>Refreshing roster...</Text>
            ) : null}
            <ScrollView
              nestedScrollEnabled
              style={styles.pickerScroll}
              showsVerticalScrollIndicator={false}
            >
              <FursuitPicker
                items={fursuits}
                selectedId={null}
                selectedIds={selectedFursuitIds}
                selectionMode="multiple"
                selectionLimit={PHOTO_CATCH_SELECTION_LIMIT}
                onSelect={handleSelectFursuit}
                isLoading={isLoadingFursuits}
                disabled={disabled || needsConventionSelection}
              />
            </ScrollView>
            {selectedFursuitList.length >= PHOTO_CATCH_SELECTION_LIMIT ? (
              <Text style={styles.previewHint}>You can submit up to 10 suits at once.</Text>
            ) : null}
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
          <View style={styles.errorContent}>
            <Text style={styles.errorText}>{localError ?? submitError}</Text>
            {permissionRecoveryLabel ? (
              <Pressable
                onPress={() => {
                  void Linking.openSettings();
                }}
                style={styles.errorAction}
                accessibilityRole="button"
              >
                <Text style={styles.errorActionText}>{permissionRecoveryLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {step !== 'idle' && (
        <View style={styles.submitActions}>
          <TailTagButton
            onPress={handleSubmit}
            disabled={!canSubmit || isCreatingInvite}
            loading={isUploadingPhoto}
            style={styles.submitButton}
          >
            {isUploadingPhoto
              ? selectedFursuitList.length > 1
                ? 'Saving catches...'
                : 'Saving catch...'
              : selectedFursuitList.length > 1
                ? `Submit ${selectedFursuitList.length} catches`
                : 'Submit Catch'}
          </TailTagButton>
          {onInviteSubmit && selectedFursuitList.length === 0 ? (
            <TailTagButton
              variant="outline"
              onPress={handleInviteSubmit}
              disabled={disabled || isSubmitting || isUploadingPhoto || isCreatingInvite || !photo}
              loading={isCreatingInvite}
              style={styles.submitButton}
            >
              {isCreatingInvite ? 'Creating invite...' : 'Invite this fursuit'}
            </TailTagButton>
          ) : null}
        </View>
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
