import { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagCard } from '../../../components/ui/TailTagCard';
import { colors, radius, spacing } from '../../../theme';
import { supabase } from '../../../lib/supabase';
import { MAX_IMAGE_SIZE, CATCH_PHOTO_BUCKET } from '../../../constants/storage';
import { loadUriAsUint8Array } from '../../../utils/files';
import { fetchConventionFursuits } from '../api/confirmations';
import { FursuitPicker } from './FursuitPicker';
import type { FursuitPickerItem } from '../api';

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
    if (conventionIds.length === 0) return;

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
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];

    if (asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE) {
      setLocalError('Photo must be 5MB or smaller. Please try again.');
      return;
    }

    setPhoto({
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
      fileName: asset.fileName ?? `catch-${Date.now()}.jpg`,
      fileSize: asset.fileSize ?? 0,
    });
    setStep('photo_taken');
    setSelectedFursuit(null);
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

    let photoUrl: string;
    try {
      // Upload photo to Supabase storage
      const extension = photo.fileName.split('.').pop()?.toLowerCase() ?? 'jpg';
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const storagePath = `${userId}/${uniqueSuffix}.${extension}`;

      const fileBytes = await loadUriAsUint8Array(photo.uri);

      const { error: uploadError } = await supabase.storage
        .from(CATCH_PHOTO_BUCKET)
        .upload(storagePath, fileBytes, {
          contentType: photo.mimeType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from(CATCH_PHOTO_BUCKET).getPublicUrl(storagePath);

      photoUrl = publicUrl;
    } catch {
      setLocalError("Couldn't upload your photo. Please check your connection and try again.");
      setIsUploadingPhoto(false);
      return;
    }

    setIsUploadingPhoto(false);

    // Resolve shared convention between catcher and selected fursuit
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

      sharedConventionId =
        conventionIds.find((id) => suitConventionIds.has(id)) ?? null;

      if (!sharedConventionId) {
        setLocalError(
          'You and this suit need to be at the same convention. Make sure both of you have opted into the same convention in Settings.',
        );
        return;
      }
    } catch {
      setLocalError("Couldn't verify convention. Please try again.");
      return;
    }

    await onCatchSubmit({
      fursuitId: selectedFursuit.id,
      conventionId: sharedConventionId,
      photoUrl,
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
      ) : (
        <>
          {/* Photo preview */}
          <View style={styles.previewRow}>
            <Image
              source={{ uri: photo!.uri }}
              style={styles.photoPreview}
              resizeMode="cover"
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

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(203,213,225,0.85)',
    fontSize: 13,
    lineHeight: 18,
  },
  cameraButton: {
    borderColor: colors.primary,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cameraButtonText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 15,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  photoPreview: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(30,41,59,0.8)',
  },
  previewActions: {
    flex: 1,
    gap: spacing.xs,
  },
  previewLabel: {
    color: colors.foreground,
    fontWeight: '600',
    fontSize: 14,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  retakeText: {
    color: 'rgba(148,163,184,0.8)',
    fontSize: 13,
  },
  pickerSection: {
    gap: spacing.sm,
  },
  pickerLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  pickerScroll: {
    maxHeight: 280,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  submitButton: {
    width: '100%',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    color: 'rgba(148,163,184,0.6)',
    fontSize: 12,
    flex: 1,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
});

