import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagCard } from '../../../components/ui/TailTagCard';
import { TailTagInput } from '../../../components/ui/TailTagInput';
import { SkipButton } from './SkipButton';
import { createQuickFursuit, type FursuitPhotoCandidate } from '../../onboarding';
import { MY_SUITS_QUERY_KEY } from '../../suits';
import { colors, radius, spacing } from '../../../theme';

type FursuitStepProps = {
  userId: string;
  onSkip: () => void;
  onComplete: (options: { created: boolean }) => void;
};

export function FursuitStep({ userId, onSkip, onComplete }: FursuitStepProps) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [speciesInput, setSpeciesInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<FursuitPhotoCandidate | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenForm = () => {
    setIsExpanded(true);
  };

  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        setPhotoError('We need media access to attach a suit photo.');
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

      const asset = result.assets?.[0];

      if (!asset) {
        setPhotoError('No photo selected.');
        return;
      }

      setSelectedPhoto({
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
        fileName: asset.fileName ?? `fursuit-${Date.now()}.jpg`,
        fileSize: asset.fileSize ?? 0,
      });
      setPhotoError(null);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : 'We could not open your photo library. Please try again.';
      setPhotoError(message);
    }
  };

  const handleClearPhoto = () => {
    setSelectedPhoto(null);
    setPhotoError(null);
  };

  const resetForm = () => {
    setNameInput('');
    setSpeciesInput('');
    setDescriptionInput('');
    setSelectedPhoto(null);
    setPhotoError(null);
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    const trimmedName = nameInput.trim();
    const trimmedSpecies = speciesInput.trim();
    const trimmedDescription = descriptionInput.trim();

    if (!trimmedName) {
      setSubmitError('Give your fursuit a name before saving.');
      return;
    }

    if (!trimmedSpecies) {
      setSubmitError('Add a suit species so others know who to call out.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await createQuickFursuit({
        userId,
        name: trimmedName,
        species: trimmedSpecies,
        description: trimmedDescription.length > 0 ? trimmedDescription : null,
        photo: selectedPhoto,
      });

      queryClient.invalidateQueries({ queryKey: [MY_SUITS_QUERY_KEY, userId] });

      resetForm();
      onComplete({ created: true });
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : 'We could not save that suit right now. Please try again.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <TailTagCard>
        <Text style={styles.eyebrow}>Step 3</Text>
        <Text style={styles.title}>Add a fursuit (optional)</Text>
        <Text style={styles.body}>
          TailTag suits are how other players recognize you. Add one now or skip and come back later.
        </Text>

        {!isExpanded ? (
          <View style={styles.ctaRow}>
            <TailTagButton onPress={handleOpenForm}>Add my fursuit</TailTagButton>
            <SkipButton onPress={onSkip} />
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Suit name</Text>
              <TailTagInput
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="e.g. Trainer Fox"
                editable={!isSubmitting}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Species</Text>
              <TailTagInput
                value={speciesInput}
                onChangeText={setSpeciesInput}
                placeholder="Fox, Dragon, Husky…"
                editable={!isSubmitting}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Description (optional)</Text>
              <TailTagInput
                value={descriptionInput}
                onChangeText={setDescriptionInput}
                placeholder="Share a quick intro or fun fact"
                editable={!isSubmitting}
                multiline
                numberOfLines={3}
                style={styles.descriptionInput}
              />
            </View>

            <View style={styles.photoSection}>
              <Text style={styles.label}>Suit photo (optional)</Text>
              {selectedPhoto ? (
                <View style={styles.photoPreview}>
                  <Image source={{ uri: selectedPhoto.uri }} style={styles.photo} />
                  <TailTagButton variant="outline" size="sm" onPress={handleClearPhoto} disabled={isSubmitting}>
                    Remove photo
                  </TailTagButton>
                </View>
              ) : (
                <TailTagButton variant="outline" size="sm" onPress={handlePickPhoto} disabled={isSubmitting}>
                  Choose photo
                </TailTagButton>
              )}
              {photoError ? <Text style={styles.error}>{photoError}</Text> : null}
            </View>

            {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

            <View style={styles.formCtaRow}>
              <SkipButton onPress={onSkip} disabled={isSubmitting} />
              <TailTagButton onPress={handleSubmit} loading={isSubmitting} disabled={isSubmitting}>
                Continue
              </TailTagButton>
            </View>
          </View>
        )}
      </TailTagCard>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  body: {
    color: 'rgba(226,232,240,0.85)',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  form: {
    gap: spacing.md,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  descriptionInput: {
    height: 90,
    textAlignVertical: 'top',
  },
  photoSection: {
    gap: spacing.sm,
  },
  photoPreview: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  photo: {
    width: 140,
    height: 140,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  error: {
    color: colors.destructive,
    fontSize: 14,
  },
  formCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
});
