import { useCallback, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagCard } from '../../../components/ui/TailTagCard';
import { TailTagInput } from '../../../components/ui/TailTagInput';
import { SkipButton } from './SkipButton';
import { createQuickFursuit, type FursuitPhotoCandidate } from '../../onboarding';
import { MY_SUITS_QUERY_KEY } from '../../suits';
import { colors, radius, spacing } from '../../../theme';
import {
  fetchFursuitColors,
  FURSUIT_COLORS_QUERY_KEY,
  MAX_FURSUIT_COLORS,
  type FursuitColorOption,
} from '../../colors';

type FursuitStepProps = {
  userId: string;
  onSkip: () => void;
  onComplete: (options: { created: boolean }) => void;
};

export function FursuitStep({ userId, onSkip, onComplete }: FursuitStepProps) {
  const queryClient = useQueryClient();
  const {
    data: colorOptions = [],
    error: colorError,
    isLoading: isColorLoading,
    refetch: refetchColors,
  } = useQuery<FursuitColorOption[], Error>({
    queryKey: [FURSUIT_COLORS_QUERY_KEY],
    queryFn: fetchFursuitColors,
    staleTime: 12 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [speciesInput, setSpeciesInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<FursuitPhotoCandidate | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedColors, setSelectedColors] = useState<FursuitColorOption[]>([]);
  const colorLoadError = colorError?.message ?? null;
  const isColorBusy = isColorLoading;

  const handleOpenForm = () => {
    setIsExpanded(true);
  };

  const handleToggleColor = useCallback((option: FursuitColorOption) => {
    setSelectedColors((current) => {
      const exists = current.some((entry) => entry.id === option.id);

      if (exists) {
        return current.filter((entry) => entry.id !== option.id);
      }

      if (current.length >= MAX_FURSUIT_COLORS) {
        return current;
      }

      return [...current, option];
    });
  }, []);

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
    setSelectedColors([]);
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
    const colorIds = selectedColors.map((color) => color.id);

    if (!trimmedName) {
      setSubmitError('Give your fursuit a name before saving.');
      return;
    }

    if (!trimmedSpecies) {
      setSubmitError('Add a suit species so others know who to call out.');
      return;
    }

    if (colorIds.length === 0) {
      setSubmitError('Pick at least one suit color before saving.');
      return;
    }

    if (colorIds.length > MAX_FURSUIT_COLORS) {
      setSubmitError('Choose up to three colors. Remove one to add another.');
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
        colorIds,
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
              <Text style={styles.label}>Colors</Text>
              <Text style={styles.helperLabel}>Pick up to three colors.</Text>
              {isColorBusy ? (
                <Text style={styles.helperLabel}>Loading colors…</Text>
              ) : colorLoadError ? (
                <View style={styles.helperColumn}>
                  <Text style={styles.error}>{colorLoadError}</Text>
                  <TailTagButton
                    variant="outline"
                    size="sm"
                    onPress={() => {
                      void refetchColors({ throwOnError: false });
                    }}
                    disabled={isSubmitting}
                  >
                    Try again
                  </TailTagButton>
                </View>
              ) : (
                <>
                  <View style={styles.colorSelectedList}>
                    {selectedColors.length === 0 ? (
                      <Text style={styles.helperLabel}>Tap a color to add it.</Text>
                    ) : null}
                    {selectedColors.map((color) => (
                      <Pressable
                        key={`selected-${color.id}`}
                        style={styles.colorSelectedChip}
                        onPress={() => handleToggleColor(color)}
                        disabled={isSubmitting}
                      >
                        <Text style={styles.colorSelectedText}>{color.name}</Text>
                        <Text style={styles.colorSelectedRemove}>Remove</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.colorOptionList}>
                    {colorOptions.map((option) => {
                      const isSelected = selectedColors.some((color) => color.id === option.id);
                      const isAtLimit = !isSelected && selectedColors.length >= MAX_FURSUIT_COLORS;
                      return (
                        <Pressable
                          key={option.id}
                          onPress={() => handleToggleColor(option)}
                          style={[
                            styles.colorChip,
                            isSelected ? styles.colorChipSelected : null,
                            isAtLimit ? styles.colorChipDisabled : null,
                          ]}
                          disabled={isSubmitting || (!isSelected && isAtLimit)}
                        >
                          <Text
                            style={[
                              styles.colorChipLabel,
                              isSelected ? styles.colorChipLabelSelected : null,
                              isAtLimit ? styles.colorChipLabelDisabled : null,
                            ]}
                          >
                            {option.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {selectedColors.length >= MAX_FURSUIT_COLORS ? (
                    <Text style={styles.helperLabel}>
                      You've selected three colors. Tap one to swap it out.
                    </Text>
                  ) : null}
                </>
              )}
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
  helperLabel: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
  },
  helperColumn: {
    gap: spacing.sm,
  },
  colorSelectedList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  colorSelectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
    backgroundColor: 'rgba(37,99,235,0.18)',
  },
  colorSelectedText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '600',
  },
  colorSelectedRemove: {
    marginLeft: spacing.xs,
    color: 'rgba(148,163,184,0.9)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  colorOptionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  colorChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  colorChipSelected: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56,189,248,0.2)',
  },
  colorChipDisabled: {
    opacity: 0.4,
  },
  colorChipLabel: {
    color: 'rgba(203,213,225,0.95)',
    fontSize: 13,
  },
  colorChipLabelSelected: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  colorChipLabelDisabled: {
    color: 'rgba(148,163,184,0.6)',
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
