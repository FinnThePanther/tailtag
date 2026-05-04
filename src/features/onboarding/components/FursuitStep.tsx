import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';

import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagCard } from '../../../components/ui/TailTagCard';
import { TailTagInput } from '../../../components/ui/TailTagInput';
import { KeyboardAwareFormWrapper } from '../../../components/ui/KeyboardAwareFormWrapper';
import { SkipButton } from './SkipButton';
import {
  createEmptyFursuitDraft,
  createQuickFursuit,
  type FursuitPhotoCandidate,
  type OnboardingFursuitDraft,
} from '@/features/onboarding';
import { MY_SUITS_QUERY_KEY } from '../../suits';
import {
  ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY,
  addFursuitConvention,
  CONVENTIONS_STALE_TIME,
  createJoinableConventionsQueryOptions,
  fetchActiveProfileConventionIds,
} from '../../conventions';
import { captureHandledException } from '../../../lib/sentry';
import { emitGameplayEvent } from '../../events';
import { processImageForUpload, IMAGE_UPLOAD_PRESETS } from '../../../utils/images';
import { colors } from '../../../theme';
import {
  getOrAssignCatchModeDefaultExperiment,
  PROFILE_QUERY_KEY,
  type ProfileSummary,
} from '../../profile';
import {
  fetchFursuitColors,
  FURSUIT_COLORS_QUERY_KEY,
  MAX_FURSUIT_COLORS,
  type FursuitColorOption,
} from '../../colors';
import { styles } from './FursuitStep.styles';

type FursuitStepProps = {
  userId: string;
  onSkip: () => void;
  onComplete: (options: { created: boolean }) => void;
  draft: OnboardingFursuitDraft;
  onDraftChange: (draft: OnboardingFursuitDraft) => void;
};

const draftPhotoDirectory = (userId: string) => {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  return `${FileSystem.documentDirectory}onboarding-drafts/${userId}/`;
};

const isOnboardingDraftPhoto = (userId: string, photo: FursuitPhotoCandidate | null) => {
  const directory = draftPhotoDirectory(userId);
  return Boolean(directory && photo?.uri.startsWith(directory));
};

const deleteDraftPhoto = async (userId: string, photo: FursuitPhotoCandidate | null) => {
  if (!isOnboardingDraftPhoto(userId, photo)) {
    return;
  }

  const uri = photo?.uri;

  if (!uri) {
    return;
  }

  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    captureHandledException(error, {
      scope: 'onboarding.fursuitStep.deleteDraftPhoto',
      userId,
      uri,
    });
  }
};

const copyDraftPhoto = async (
  userId: string,
  photo: FursuitPhotoCandidate,
): Promise<FursuitPhotoCandidate> => {
  const directory = draftPhotoDirectory(userId);

  if (!directory) {
    throw new Error('We could not save that photo for onboarding. Please try another.');
  }

  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  const fileName = `fursuit-${Date.now()}.jpg`;
  const uri = `${directory}${fileName}`;
  await FileSystem.copyAsync({
    from: photo.uri,
    to: uri,
  });

  return {
    ...photo,
    uri,
    fileName,
  };
};

export function FursuitStep({
  userId,
  onSkip,
  onComplete,
  draft,
  onDraftChange,
}: FursuitStepProps) {
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
  const [isExpanded, setIsExpanded] = useState(draft.isExpanded);
  const [nameInput, setNameInput] = useState(draft.nameInput);
  const [speciesInput, setSpeciesInput] = useState(draft.speciesInput);
  const [descriptionInput, setDescriptionInput] = useState(draft.descriptionInput);
  const [selectedPhoto, setSelectedPhoto] = useState<FursuitPhotoCandidate | null>(
    draft.selectedPhoto,
  );
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedColorIds, setSelectedColorIds] = useState<string[]>(draft.selectedColorIds);
  const colorLoadError = colorError?.message ?? null;
  const isColorBusy = isColorLoading;

  const { data: conventions = [] } = useQuery({
    ...createJoinableConventionsQueryOptions(),
    enabled: Boolean(userId),
  });

  const { data: profileConventionIds = [] } = useQuery<string[], Error>({
    queryKey: [ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY, userId],
    enabled: Boolean(userId),
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchActiveProfileConventionIds(userId),
  });

  const profileConventionIdSet = useMemo(
    () => new Set(profileConventionIds),
    [profileConventionIds],
  );

  const activeConventionIds = useMemo(
    () => conventions.filter((c) => profileConventionIdSet.has(c.id)).map((c) => c.id),
    [conventions, profileConventionIdSet],
  );

  const selectedColors = useMemo(
    () =>
      selectedColorIds
        .map((colorId) => colorOptions.find((option) => option.id === colorId))
        .filter((option): option is FursuitColorOption => Boolean(option)),
    [colorOptions, selectedColorIds],
  );

  useEffect(() => {
    let isMounted = true;

    const exposeCatchModeExperiment = async () => {
      try {
        const assignment = await getOrAssignCatchModeDefaultExperiment();

        if (!isMounted || !assignment) {
          return;
        }

        queryClient.setQueryData<ProfileSummary | null>([PROFILE_QUERY_KEY, userId], (current) =>
          current
            ? {
                ...current,
                default_catch_mode: assignment.currentCatchMode,
                catch_mode_preference_source: assignment.currentPreferenceSource,
              }
            : current,
        );

        const commonPayload = {
          experiment_key: assignment.experimentKey,
          variant: assignment.variant,
          previous_catch_mode: assignment.previousCatchMode,
          current_catch_mode: assignment.currentCatchMode,
          previous_preference_source: assignment.previousPreferenceSource,
          preference_source: assignment.currentPreferenceSource,
          default_applied: assignment.defaultApplied,
          source: 'onboarding_fursuit',
        };

        if (assignment.assignmentCreated) {
          void emitGameplayEvent({
            type: 'experiment_assigned',
            payload: commonPayload,
            occurredAt: assignment.exposedAt,
            idempotencyKey: `${assignment.experimentKey}:${userId}:assigned`,
          });
        }

        void emitGameplayEvent({
          type: 'experiment_exposed',
          payload: commonPayload,
          occurredAt: assignment.exposedAt,
          idempotencyKey: `${assignment.experimentKey}:${userId}:exposed:${assignment.exposedAt}`,
        });

        if (assignment.defaultApplied) {
          void emitGameplayEvent({
            type: 'catch_mode_default_applied',
            payload: {
              ...commonPayload,
              new_catch_mode: assignment.currentCatchMode,
            },
            occurredAt: assignment.exposedAt,
            idempotencyKey: `${assignment.experimentKey}:${userId}:default-applied`,
          });
        }
      } catch (error) {
        captureHandledException(error, {
          scope: 'onboarding.fursuitStep.catchModeExperiment',
          userId,
        });
      }
    };

    void exposeCatchModeExperiment();

    return () => {
      isMounted = false;
    };
  }, [queryClient, userId]);

  useEffect(() => {
    onDraftChange({
      isExpanded,
      nameInput,
      speciesInput,
      descriptionInput,
      selectedColorIds,
      selectedPhoto,
    });
  }, [
    descriptionInput,
    isExpanded,
    nameInput,
    onDraftChange,
    selectedColorIds,
    selectedPhoto,
    speciesInput,
  ]);

  const handleOpenForm = () => {
    setIsExpanded(true);
  };

  const handleToggleColor = useCallback((option: FursuitColorOption) => {
    Keyboard.dismiss();
    setSelectedColorIds((current) => {
      const exists = current.includes(option.id);

      if (exists) {
        return current.filter((colorId) => colorId !== option.id);
      }

      if (current.length >= MAX_FURSUIT_COLORS) {
        return current;
      }

      return [...current, option.id];
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

      setIsProcessingPhoto(true);
      setPhotoError(null);
      try {
        const processed = await processImageForUpload(
          asset.uri,
          IMAGE_UPLOAD_PRESETS.fursuitAvatar,
        );
        const draftPhoto = await copyDraftPhoto(userId, {
          uri: processed.uri,
          mimeType: 'image/jpeg',
          fileName: `fursuit-${Date.now()}.jpg`,
          fileSize: 0,
        });
        await deleteDraftPhoto(userId, selectedPhoto);
        setSelectedPhoto(draftPhoto);
      } catch (error) {
        captureHandledException(error, {
          scope: 'onboarding.fursuitStep.copyPhoto',
          userId,
          assetUri: asset.uri,
        });
        setPhotoError('We could not process that photo. Please try another.');
      } finally {
        setIsProcessingPhoto(false);
      }
    } catch (caught) {
      captureHandledException(caught, {
        scope: 'onboarding.fursuitStep.pickPhoto',
        userId,
      });
      const message =
        caught instanceof Error
          ? caught.message
          : 'We could not open your photo library. Please try again.';
      setPhotoError(message);
    }
  };

  const handleClearPhoto = () => {
    if (isProcessingPhoto) {
      return;
    }

    void deleteDraftPhoto(userId, selectedPhoto);
    setSelectedPhoto(null);
    setPhotoError(null);
  };

  const resetForm = () => {
    const emptyDraft = createEmptyFursuitDraft();
    setIsExpanded(emptyDraft.isExpanded);
    setNameInput(emptyDraft.nameInput);
    setSpeciesInput(emptyDraft.speciesInput);
    setDescriptionInput(emptyDraft.descriptionInput);
    setSelectedColorIds(emptyDraft.selectedColorIds);
    setSelectedPhoto(null);
    setPhotoError(null);
    setSubmitError(null);
    onDraftChange(emptyDraft);
  };

  const handleSkip = () => {
    if (isProcessingPhoto) {
      return;
    }

    void deleteDraftPhoto(userId, selectedPhoto);
    resetForm();
    onSkip();
  };

  const handleSubmit = async () => {
    if (isSubmitting || isProcessingPhoto) {
      return;
    }

    const trimmedName = nameInput.trim();
    const trimmedSpecies = speciesInput.trim();
    const trimmedDescription = descriptionInput.trim();
    const colorIds = selectedColorIds;

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
      const fursuitId = await createQuickFursuit({
        userId,
        name: trimmedName,
        species: trimmedSpecies,
        description: trimmedDescription.length > 0 ? trimmedDescription : null,
        photo: selectedPhoto,
        colorIds,
      });

      if (activeConventionIds.length > 0) {
        void Promise.all(
          activeConventionIds.map((conventionId) =>
            addFursuitConvention(fursuitId, conventionId).catch((error) => {
              captureHandledException(error, {
                scope: 'onboarding.fursuitStep.attachConvention',
                userId,
                fursuitId,
                conventionId,
              });
            }),
          ),
        );
      }

      queryClient.invalidateQueries({ queryKey: [MY_SUITS_QUERY_KEY, userId] });

      await deleteDraftPhoto(userId, selectedPhoto);
      resetForm();
      onComplete({ created: true });
    } catch (caught) {
      captureHandledException(caught, {
        scope: 'onboarding.fursuitStep.submitPhoto',
        userId,
      });
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
    <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
      <TailTagCard>
        <Text style={styles.eyebrow}>Step 3</Text>
        <Text style={styles.title}>Add a fursuit (optional)</Text>
        <Text style={styles.body}>
          Fursuits are how other players recognize you. Add one now or skip and come back later.
        </Text>

        {!isExpanded ? (
          <View style={styles.ctaRow}>
            <TailTagButton
              style={styles.fullWidthCta}
              onPress={handleOpenForm}
            >
              Add my fursuit
            </TailTagButton>
            <SkipButton
              style={styles.fullWidthCta}
              onPress={handleSkip}
              disabled={isProcessingPhoto}
            />
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Suit name</Text>
              <TailTagInput
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="e.g. Maple"
                editable={!isSubmitting}
                keyboardType="default"
                autoCapitalize="words"
                autoCorrect
                returnKeyType="next"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Species</Text>
              <TailTagInput
                value={speciesInput}
                onChangeText={setSpeciesInput}
                placeholder="Fox, Dragon, Husky…"
                editable={!isSubmitting}
                keyboardType="default"
                autoCapitalize="words"
                autoCorrect
                returnKeyType="done"
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

            <View style={styles.photoSection}>
              <Text style={styles.label}>Suit photo (optional)</Text>
              {isProcessingPhoto ? (
                <View style={[styles.photo, styles.photoProcessing]}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : selectedPhoto ? (
                <View style={styles.photoPreview}>
                  <Image
                    source={selectedPhoto.uri}
                    style={styles.photo}
                    contentFit="cover"
                  />
                  <TailTagButton
                    variant="outline"
                    size="sm"
                    onPress={handleClearPhoto}
                    disabled={isSubmitting || isProcessingPhoto}
                  >
                    Remove photo
                  </TailTagButton>
                </View>
              ) : (
                <TailTagButton
                  variant="outline"
                  size="sm"
                  onPress={handlePickPhoto}
                  disabled={isSubmitting || isProcessingPhoto}
                >
                  Choose photo
                </TailTagButton>
              )}
              {photoError ? <Text style={styles.error}>{photoError}</Text> : null}
            </View>

            {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

            <View style={styles.formCtaRow}>
              <TailTagButton
                onPress={handleSubmit}
                loading={isSubmitting}
                disabled={isSubmitting || isProcessingPhoto}
                style={styles.fullWidthCta}
              >
                Continue
              </TailTagButton>
              <SkipButton
                onPress={handleSkip}
                disabled={isSubmitting || isProcessingPhoto}
                style={styles.fullWidthCta}
              />
            </View>
          </View>
        )}
      </TailTagCard>
    </KeyboardAwareFormWrapper>
  );
}
