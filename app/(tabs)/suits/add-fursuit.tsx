import { useCallback, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { TailTagButton } from '../../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../../src/components/ui/TailTagCard';
import { TailTagInput } from '../../../src/components/ui/TailTagInput';
import { FURSUIT_BUCKET, MAX_IMAGE_SIZE } from '../../../src/constants/storage';
import { UNIQUE_CODE_ATTEMPTS, UNIQUE_INSERT_ATTEMPTS } from '../../../src/constants/codes';
import { useAuth } from '../../../src/features/auth';
import { supabase } from '../../../src/lib/supabase';
import { generateUniqueCodeCandidate } from '../../../src/utils/code';
import { loadUriAsUint8Array } from '../../../src/utils/files';
import { colors, spacing, radius } from '../../../src/theme';
import { MY_SUITS_QUERY_KEY } from '../../../src/features/suits';

import type { FursuitsInsert } from '../../../src/types/database';

type UploadCandidate = {
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
} | null;

export default function AddFursuitScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();

  const [nameInput, setNameInput] = useState('');
  const [speciesInput, setSpeciesInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [selectedPhoto, setSelectedPhoto] = useState<UploadCandidate>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const ensureUniqueCode = useCallback(async () => {
    const client = supabase as any;

    for (let attempt = 0; attempt < UNIQUE_CODE_ATTEMPTS; attempt += 1) {
      const candidate = generateUniqueCodeCandidate();
      const { data, error } = await client
        .from('fursuits')
        .select('id')
        .eq('unique_code', candidate)
        .limit(1);

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return candidate;
      }
    }

    throw new Error("We couldn't generate a unique tag code. Please try again.");
  }, []);

  const handlePickPhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        setPhotoError('We need media library access to select a photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];

      if (!asset) {
        setPhotoError('No photo selected.');
        return;
      }

      if (asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE) {
        setPhotoError('Suit photos must be 5MB or smaller.');
        return;
      }

      const candidate: UploadCandidate = {
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
        fileName: asset.fileName ?? `fursuit-${Date.now()}.jpg`,
        fileSize: asset.fileSize ?? 0,
      };

      setSelectedPhoto(candidate);
      setPhotoError(null);
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : 'We could not open your photo library. Please try again.';
      setPhotoError(fallbackMessage);
    }
  }, []);

  const handleClearPhoto = () => {
    setSelectedPhoto(null);
    setPhotoError(null);
  };

  const handleSubmit = async () => {
    if (!userId || isSubmitting) {
      return;
    }

    const trimmedName = nameInput.trim();
    const trimmedSpecies = speciesInput.trim();

    if (!trimmedName) {
      setSubmitError('Give your fursuit a name before saving.');
      return;
    }

    if (selectedPhoto && selectedPhoto.fileSize > MAX_IMAGE_SIZE) {
      setSubmitError('Suit photos must be 5MB or smaller.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    let uploadedStoragePath: string | null = null;

    try {
      let avatarUrl: string | null = null;

      if (selectedPhoto) {
        const extension = selectedPhoto.fileName.split('.').pop()?.toLowerCase() ?? 'png';
        const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const storagePath = `${userId}/${uniqueSuffix}.${extension}`;
        uploadedStoragePath = storagePath;

        const fileBytes = await loadUriAsUint8Array(selectedPhoto.uri);

        const { error: uploadError } = await supabase.storage
          .from(FURSUIT_BUCKET)
          .upload(storagePath, fileBytes, {
            contentType: selectedPhoto.mimeType,
            upsert: true,
          });

        if (uploadError) {
          throw uploadError;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from(FURSUIT_BUCKET).getPublicUrl(storagePath);

        avatarUrl = publicUrl;
      }

      let isInserted = false;

      for (let attempt = 0; attempt < UNIQUE_INSERT_ATTEMPTS; attempt += 1) {
        const uniqueCode = await ensureUniqueCode();
        const payload: FursuitsInsert = {
          owner_id: userId,
          name: trimmedName,
          species: trimmedSpecies.length > 0 ? trimmedSpecies : null,
          avatar_url: avatarUrl,
          unique_code: uniqueCode,
        };

        const { error } = await (supabase as any).from('fursuits').insert(payload);

        if (!error) {
          isInserted = true;
          break;
        }

        if (error.code !== '23505') {
          throw error;
        }
      }

      if (!isInserted) {
        throw new Error('We could not save your fursuit. Please try again.');
      }

      setNameInput('');
      setSpeciesInput('');
      setSelectedPhoto(null);
      setPhotoError(null);
      setSubmitError(null);

      queryClient.invalidateQueries({ queryKey: [MY_SUITS_QUERY_KEY, userId] });
      router.back();
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : "We couldn't save your fursuit right now. Please try again.";
      setSubmitError(fallbackMessage);

      if (uploadedStoragePath) {
        const { error: cleanupError } = await supabase.storage
          .from(FURSUIT_BUCKET)
          .remove([uploadedStoragePath]);

        if (cleanupError) {
          console.warn('Failed to clean up uploaded suit photo after error', cleanupError);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Add fursuit</Text>
          <Text style={styles.title}>Tag a new suit</Text>
          <Text style={styles.subtitle}>
            Upload a photo, add a name, and TailTag will generate a unique catch code for you.
          </Text>
        </View>

        <TailTagCard>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Suit photo</Text>
            <View style={styles.photoRow}>
              {selectedPhoto ? (
                <Image source={{ uri: selectedPhoto.uri }} style={styles.photoPreview} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Text style={styles.photoPlaceholderText}>No photo</Text>
                </View>
              )}
            </View>
            <View style={styles.photoButtons}>
              <TailTagButton
                variant="outline"
                onPress={handlePickPhoto}
                disabled={isSubmitting}
                style={styles.photoButtonSpacing}
              >
                Choose photo
              </TailTagButton>
              {selectedPhoto ? (
                <TailTagButton variant="ghost" onPress={handleClearPhoto} disabled={isSubmitting}>
                  Remove photo
                </TailTagButton>
              ) : null}
            </View>
            {photoError ? <Text style={styles.errorText}>{photoError}</Text> : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Name</Text>
            <TailTagInput
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Eclipse the Sergal"
              editable={!isSubmitting}
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Species</Text>
            <TailTagInput
              value={speciesInput}
              onChangeText={setSpeciesInput}
              placeholder="Optional—Sergal, Dutch Angel Dragon, etc."
              editable={!isSubmitting}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>

          {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

          <TailTagButton onPress={handleSubmit} loading={isSubmitting} disabled={isSubmitting}>
            Save fursuit
          </TailTagButton>
        </TailTagCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.foreground,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(203,213,225,0.9)',
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  photoRow: {
    alignItems: 'flex-start',
  },
  photoPreview: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
  },
  photoPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  photoPlaceholderText: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  photoButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoButtonSpacing: {
    marginRight: spacing.sm,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
});
