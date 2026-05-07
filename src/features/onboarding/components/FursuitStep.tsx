import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';

import * as FileSystem from 'expo-file-system/legacy';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagCard } from '../../../components/ui/TailTagCard';
import { TailTagInput } from '../../../components/ui/TailTagInput';
import { SkipButton } from './SkipButton';
import { ConventionToggle } from '../../../components/conventions/ConventionToggle';
import {
  createEmptyFursuitDraft,
  createQuickFursuit,
  type FursuitPhotoCandidate,
  type OnboardingFursuitDraft,
} from '@/features/onboarding';
import { MY_SUITS_QUERY_KEY } from '../../suits';
import {
  addFursuitConvention,
  CONVENTIONS_STALE_TIME,
  createJoinableConventionsQueryOptions,
  fetchProfileConventionMemberships,
  PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY,
  type ConventionMembership,
  type ConventionSummary,
} from '../../conventions';
import { captureHandledException } from '../../../lib/sentry';
import { emitGameplayEvent } from '../../events';
import { launchFursuitPhotoPickerAsync } from '../../../utils/imagePicker';
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

const EXPERIMENT_EVENT_TIMEOUT_MS = 5000;

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
  const [selectedConventionIds, setSelectedConventionIds] = useState<Set<string>>(
    new Set(draft.selectedConventionIds),
  );
  const isMountedRef = useRef(true);
  const colorLoadError = colorError?.message ?? null;
  const isColorBusy = isColorLoading;

  const {
    data: conventions = [],
    error: conventionsError,
    isLoading: isConventionsLoading,
    refetch: refetchConventions,
  } = useQuery<ConventionSummary[], Error>({
    ...createJoinableConventionsQueryOptions(),
    enabled: Boolean(userId),
  });

  const {
    data: profileConventionMemberships = [],
    error: profileConventionsError,
    isLoading: isProfileConventionsLoading,
    refetch: refetchProfileConventions,
  } = useQuery<ConventionMembership[], Error>({
    queryKey: [PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY, userId],
    enabled: Boolean(userId),
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: fetchProfileConventionMemberships,
  });

  const profileConventionIdSet = useMemo(
    () => new Set(profileConventionMemberships.map((membership) => membership.convention_id)),
    [profileConventionMemberships],
  );

  const isConventionsBusy = isConventionsLoading || isProfileConventionsLoading;
  const conventionsLoadError =
    conventionsError?.message ?? profileConventionsError?.message ?? null;

  const selectedColors = useMemo(
    () =>
      selectedColorIds
        .map((colorId) => colorOptions.find((option) => option.id === colorId))
        .filter((option): option is FursuitColorOption => Boolean(option)),
    [colorOptions, selectedColorIds],
  );

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const createTimeoutPromise = useCallback(
    (eventType: string) =>
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Catch mode experiment event timed out after ${EXPERIMENT_EVENT_TIMEOUT_MS}ms (${eventType})`,
            ),
          );
        }, EXPERIMENT_EVENT_TIMEOUT_MS);
      }),
    [],
  );

  const exposeCatchModeExperiment = useCallback(async () => {
    try {
      const assignment = await getOrAssignCatchModeDefaultExperiment();

      if (!isMountedRef.current || !assignment) {
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

      const emitExperimentEvent = (input: Parameters<typeof emitGameplayEvent>[0]) => {
        const eventType = input.type;

        void Promise.race([emitGameplayEvent(input), createTimeoutPromise(eventType)]).catch(
          (error) => {
            captureHandledException(error, {
              scope: 'onboarding.fursuitStep.catchModeExperiment.event',
              eventType,
              experimentKey: assignment.experimentKey,
              userId,
            });
          },
        );
      };

      if (assignment.assignmentCreated) {
        emitExperimentEvent({
          type: 'experiment_assigned',
          payload: commonPayload,
          occurredAt: assignment.exposedAt,
          idempotencyKey: `${assignment.experimentKey}:${userId}:assigned`,
        });
      }

      emitExperimentEvent({
        type: 'experiment_exposed',
        payload: commonPayload,
        occurredAt: assignment.exposedAt,
        idempotencyKey: `${assignment.experimentKey}:${userId}:exposed:${assignment.exposedAt}`,
      });

      if (assignment.defaultApplied) {
        emitExperimentEvent({
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
  }, [createTimeoutPromise, queryClient, userId]);

  useEffect(() => {
    onDraftChange({
      isExpanded,
      nameInput,
      speciesInput,
      descriptionInput,
      selectedColorIds,
      selectedConventionIds: [...selectedConventionIds],
      selectedPhoto,
    });
  }, [
    descriptionInput,
    isExpanded,
    nameInput,
    onDraftChange,
    selectedColorIds,
    selectedConventionIds,
    selectedPhoto,
    speciesInput,
  ]);

  useEffect(() => {
    setSelectedConventionIds((current) => {
      const filtered = new Set([...current].filter((id) => profileConventionIdSet.has(id)));
      return filtered.size === current.size ? current : filtered;
    });
  }, [profileConventionIdSet]);

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

  const handleConventionToggle = useCallback(
    (conventionId: string, nextSelected: boolean) => {
      if (!profileConventionIdSet.has(conventionId)) {
        return;
      }

      setSelectedConventionIds((current) => {
        const next = new Set(current);

        if (nextSelected) {
          next.add(conventionId);
        } else {
          next.delete(conventionId);
        }

        return next;
      });
    },
    [profileConventionIdSet],
  );

  const handlePickPhoto = async () => {
    try {
      const result = await launchFursuitPhotoPickerAsync();

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
    setSelectedConventionIds(new Set(emptyDraft.selectedConventionIds));
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

      const listedConventionIds = [...selectedConventionIds].filter((conventionId) =>
        profileConventionIdSet.has(conventionId),
      );

      if (listedConventionIds.length > 0) {
        void Promise.all(
          listedConventionIds.map((conventionId) =>
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
      void exposeCatchModeExperiment();

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
    <View style={styles.container}>
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

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Convention roster</Text>
              <Text style={styles.helperLabel}>
                List this suit only at conventions you are attending.
              </Text>
              {isConventionsBusy ? (
                <Text style={styles.helperLabel}>Loading conventions…</Text>
              ) : conventionsLoadError ? (
                <View style={styles.helperColumn}>
                  <Text style={styles.error}>{conventionsLoadError}</Text>
                  <TailTagButton
                    variant="outline"
                    size="sm"
                    onPress={() => {
                      void refetchConventions({ throwOnError: false });
                      void refetchProfileConventions({ throwOnError: false });
                    }}
                    disabled={isSubmitting}
                  >
                    Try again
                  </TailTagButton>
                </View>
              ) : conventions.length === 0 ? (
                <Text style={styles.helperLabel}>
                  No conventions are open for joining right now.
                </Text>
              ) : profileConventionIdSet.size === 0 ? (
                <Text style={styles.helperLabel}>
                  Attend a convention before listing this suit.
                </Text>
              ) : (
                <View style={styles.conventionList}>
                  {conventions.map((convention) => {
                    const isAllowed = profileConventionIdSet.has(convention.id);
                    const isSelected = selectedConventionIds.has(convention.id);

                    return (
                      <ConventionToggle
                        key={convention.id}
                        convention={convention}
                        selected={isSelected}
                        pending={false}
                        disabled={isSubmitting || !isAllowed}
                        badgeText={
                          isAllowed ? (isSelected ? 'Listed' : 'List suit') : 'Attend first'
                        }
                        onToggle={(conventionId, nextSelected) =>
                          handleConventionToggle(conventionId, nextSelected)
                        }
                      />
                    );
                  })}
                </View>
              )}
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
    </View>
  );
}
