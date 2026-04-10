import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagCard } from '../../../components/ui/TailTagCard';
import { colors } from '../../../theme';
import { supabase } from '../../../lib/supabase';
import { CATCH_PHOTO_BUCKET } from '../../../constants/storage';
import { loadUriAsUint8Array } from '../../../utils/files';
import {
  processImageForUpload,
  IMAGE_UPLOAD_PRESETS,
} from '../../../utils/images';
import { buildAuthenticatedStorageObjectUrl } from '../../../utils/supabase-image';
import { createCatch, updateCatchPhoto, fetchConventionFursuits } from '../api/confirmations';
import { FursuitPicker } from './FursuitPicker';
import type { FursuitPickerItem } from '../api';
import type { CreateCatchResult } from '../types';
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
    photoUrl: string;
    catchResult: CreateCatchResult;
  }) => Promise<void>;
  isSubmitting?: boolean;
  submitError?: string | null;
};

type Step = 'idle' | 'photo_taken' | 'fursuit_selected';

export function PhotoCatchCard({
  userId,
  onCatchSubmit,
  isSubmitting = false,
  submitError,
}: PhotoCatchCardProps) {
  const [step, setStep] = useState<Step>('idle');
  const [photo, setPhoto] = useState<PhotoCandidate | null>(null);
  const [selectedFursuit, setSelectedFursuit] = useState<FursuitPickerItem | null>(null);
  const [fursuits, setFursuits] = useState<FursuitPickerItem[]>([]);
  const [conventionIds, setConventionIds] = useState<string[]>([]);
  const [isLoadingFursuits, setIsLoadingFursuits] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Load user's conventions once mounted
  useEffect(() => {
    const client = supabase as any;
    client
      .from('profile_conventions')
      .select('convention_id')
      .eq('profile_id', userId)
      .then(({ data }: { data: { convention_id: string }[] | null }) => {
        setConventionIds((data ?? []).map((r) => r.convention_id));
      });
  }, [userId]);

  // Load convention fursuits when photo is taken
  useEffect(() => {
    if (step !== 'photo_taken') return;
    if (conventionIds.length === 0) {
      setIsLoadingFursuits(false);
      return;
    }

    setIsLoadingFursuits(true);
    fetchConventionFursuits(conventionIds, userId)
      .then(setFursuits)
      .catch(() => setLocalError("Couldn't load fursuits. Please try again."))
      .finally(() => setIsLoadingFursuits(false));
  }, [step, conventionIds, userId]);

  const handleTakePhoto = async () => {
    setLocalError(null);

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setLocalError('Camera permission is required to take a photo. Please enable it in Settings.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
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
    try {
      const processed = await processImageForUpload(asset.uri, IMAGE_UPLOAD_PRESETS.catchPhoto);
      setPhoto({
        uri: processed.uri,
        mimeType: 'image/jpeg',
        fileName: `catch-${Date.now()}.jpg`,
        fileSize: 0,
      });
      setIsLoadingFursuits(true);
      setStep('photo_taken');
      setSelectedFursuit(null);
    } catch {
      setLocalError("We couldn't process your photo. Please try again.");
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleRetakePhoto = () => {
    setPhoto(null);
    setSelectedFursuit(null);
    setStep('idle');
    setLocalError(null);
  };

  const handleSelectFursuit = (item: FursuitPickerItem) => {
    setSelectedFursuit((prev) => (prev?.id === item.id ? null : item));
  };

  const handleSubmit = async () => {
    if (!photo || !selectedFursuit) return;
    setLocalError(null);
    setIsUploadingPhoto(true);

    // Step 1: Validate shared convention before doing any uploads
    const client = supabase as any;
    let sharedConventionId: string | null = null;

    try {
      const { data: suitConventionRows } = await client
        .from('fursuit_conventions')
        .select('convention_id')
        .eq('fursuit_id', selectedFursuit.id);

      const suitConventionIds = new Set<string>(
        (suitConventionRows ?? []).map((r: { convention_id: string }) => r.convention_id),
      );

      sharedConventionId = conventionIds.find((id) => suitConventionIds.has(id)) ?? null;

      if (!sharedConventionId) {
        setLocalError(
          'You and this suit need to be at the same convention. Make sure both of you have opted into the same convention in Settings.',
        );
        setIsUploadingPhoto(false);
        return;
      }
    } catch {
      setLocalError("Couldn't verify convention. Please try again.");
      setIsUploadingPhoto(false);
      return;
    }

    // Step 2: Create the catch record first — before uploading the photo.
    // This way, if the catch is invalid (duplicate, own fursuit, etc.) we fail
    // fast without wasting a storage upload.
    let catchResult: CreateCatchResult;
    try {
      catchResult = await createCatch({
        fursuitId: selectedFursuit.id,
        conventionId: sharedConventionId,
        isTutorial: false,
        forcePending: true,
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Couldn't create catch. Please try again.");
      setIsUploadingPhoto(false);
      return;
    }

    // Step 3: Upload the photo. On failure, roll back the catch.
    let photoUrl: string;
    let storagePath: string;
    try {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      storagePath = `${userId}/${uniqueSuffix}.jpg`;

      const fileBytes = await loadUriAsUint8Array(photo.uri);

      const { error: uploadError } = await supabase.storage
        .from(CATCH_PHOTO_BUCKET)
        .upload(storagePath, fileBytes, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      photoUrl = buildAuthenticatedStorageObjectUrl(CATCH_PHOTO_BUCKET, storagePath);
    } catch {
      // Roll back the catch so it doesn't sit in the owner's pending queue without a photo
      await Promise.resolve((client as typeof supabase).from('catches').delete().eq('id', catchResult.catchId)).catch(() => {});
      setLocalError("Couldn't upload your photo. Please check your connection and try again.");
      setIsUploadingPhoto(false);
      return;
    }

    // Step 4: Attach the photo URL to the catch. On failure, roll back both.
    try {
      await updateCatchPhoto(catchResult.catchId, {
        photoPath: storagePath,
        photoUrl,
      });
    } catch {
      await Promise.resolve((client as typeof supabase).from('catches').delete().eq('id', catchResult.catchId)).catch(() => {});
      await supabase.storage.from(CATCH_PHOTO_BUCKET).remove([storagePath]).catch(() => {});
      setLocalError("Couldn't save your photo. Please check your connection and try again.");
      setIsUploadingPhoto(false);
      return;
    }

    setIsUploadingPhoto(false);

    await onCatchSubmit({
      fursuitId: selectedFursuit.id,
      conventionId: sharedConventionId,
      photoUrl,
      catchResult,
    });
  };

  const canSubmit = Boolean(photo) && Boolean(selectedFursuit) && !isSubmitting && !isUploadingPhoto;
  const isBusy = isSubmitting || isUploadingPhoto;

  return (
    <TailTagCard style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons name="camera" size={20} color={colors.primary} />
        <Text style={styles.title}>Photo Catch</Text>
      </View>
      <Text style={styles.subtitle}>
        Take a selfie with a fursuiter to log the catch. The owner will review your photo before it counts.
      </Text>

      {step === 'idle' ? (
        isProcessingPhoto ? (
          <View style={styles.processingContainer}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.processingText}>Processing photo…</Text>
          </View>
        ) : (
          <TailTagButton
            variant="outline"
            onPress={handleTakePhoto}
            style={styles.cameraButton}
          >
            <View style={styles.buttonContent}>
              <Ionicons name="camera-outline" size={18} color={colors.primary} />
              <Text style={styles.cameraButtonText}>Open Camera</Text>
            </View>
          </TailTagButton>
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
              <Text style={styles.previewLabel}>Selfie taken</Text>
              <Pressable onPress={handleRetakePhoto} style={styles.retakeButton}>
                <Ionicons name="refresh-outline" size={14} color="rgba(148,163,184,0.8)" />
                <Text style={styles.retakeText}>Retake</Text>
              </Pressable>
            </View>
          </View>

          {/* Fursuit picker */}
          <View style={styles.pickerSection}>
            <Text style={styles.pickerLabel}>Which fursuit did you catch?</Text>
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
              />
            </ScrollView>
          </View>
        </>
      )}

      {(localError ?? submitError) ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={18} color="#f87171" />
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
          {isUploadingPhoto ? 'Uploading photo…' : 'Submit Catch'}
        </TailTagButton>
      )}

      <View style={styles.infoRow}>
        <Ionicons name="information-circle-outline" size={14} color="rgba(148,163,184,0.6)" />
        <Text style={styles.infoText}>Photo catches always require owner approval.</Text>
      </View>
    </TailTagCard>
  );
}
