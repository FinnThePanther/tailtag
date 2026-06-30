import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Switch, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import * as FileSystem from 'expo-file-system/legacy';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { ConventionToggle } from '@/components/conventions/ConventionToggle';
import { TailTagButton } from '@/components/ui/TailTagButton';
import { TailTagCard } from '@/components/ui/TailTagCard';
import { TailTagInput } from '@/components/ui/TailTagInput';
import { SkipButton } from './SkipButton';
import {
  createEmptyFursuitDraft,
  createQuickFursuit,
  type FursuitPhotoCandidate,
  type OnboardingFursuitDraft,
} from '@/features/onboarding';
import {
  InteractionPreferencesEditor,
  getInteractionPreferencesError,
  type InteractionBadgeKey,
  type SocialSignalKey,
} from '@/features/interaction-preferences';
import { MY_SUITS_QUERY_KEY } from '@/features/suits';
import {
  addFursuitConvention,
  ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY,
  CONVENTIONS_STALE_TIME,
  createJoinableConventionsQueryOptions,
  fetchProfileConventionMemberships,
  optInToConvention,
  PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY,
  useConventionVerificationAction,
  type ConventionMembership,
  type ConventionSummary,
  type VerifiedLocation,
} from '@/features/conventions';
import { captureHandledException } from '@/lib/sentry';
import { getUserVisibleErrorMessage } from '@/lib/userVisibleErrors';
import { emitGameplayEvent } from '@/features/events';
import { launchFursuitPhotoPickerAsync } from '@/utils/imagePicker';
import { processImageForUpload, IMAGE_UPLOAD_PRESETS } from '@/utils/images';
import { colors } from '@/theme';
import {
  getOrAssignCatchModeDefaultExperiment,
  PROFILE_QUERY_KEY,
  type ProfileSummary,
} from '@/features/profile';
import {
  buildFursuitSpeciesSuggestions,
  fetchFursuitSpecies,
  FURSUIT_SPECIES_QUERY_KEY,
  type FursuitSpeciesOption,
} from '@/features/species';
import {
  fetchFursuitColors,
  FURSUIT_COLORS_QUERY_KEY,
  MAX_FURSUIT_COLORS,
  type FursuitColorOption,
} from '@/features/colors';
import { styles } from './FursuitStep.styles';
import { profileNeedsAgeAttestation, type VisibilityAudience } from '@/features/adult-boundary';
import {
  ANONYMOUS_FURSUITS_FEATURE_KEY,
  featureFlagQueryKey,
  isFeatureEnabledForProfile,
} from '@/features/feature-flags';

const EXPERIMENT_EVENT_TIMEOUT_MS = 5000;
const FURSUIT_SKIP_LABEL = "I'll be playing\nwithout a fursuit";
const FURSUIT_SKIP_ACCESSIBILITY_LABEL = "I'll be playing without a fursuit";

type FursuitStepProps = {
  userId: string;
  profile: ProfileSummary | null | undefined;
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
  profile,
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
  const { data: speciesOptions = [] } = useQuery<FursuitSpeciesOption[], Error>({
    queryKey: [FURSUIT_SPECIES_QUERY_KEY],
    queryFn: fetchFursuitSpecies,
    staleTime: 12 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const { data: anonymousFursuitsEnabled = false } = useQuery({
    queryKey: featureFlagQueryKey(ANONYMOUS_FURSUITS_FEATURE_KEY, userId),
    queryFn: () => isFeatureEnabledForProfile(ANONYMOUS_FURSUITS_FEATURE_KEY, userId),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const [isExpanded, setIsExpanded] = useState(draft.isExpanded);
  const [nameInput, setNameInput] = useState(draft.nameInput);
  const [speciesInput, setSpeciesInput] = useState(draft.speciesInput);
  const [descriptionInput, setDescriptionInput] = useState(draft.descriptionInput);
  const [photoCreditInput, setPhotoCreditInput] = useState(draft.photoCreditInput);
  const [showPhotoCreditInput, setShowPhotoCreditInput] = useState(draft.showPhotoCreditInput);
  const [selectedPhoto, setSelectedPhoto] = useState<FursuitPhotoCandidate | null>(
    draft.selectedPhoto,
  );
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedColorIds, setSelectedColorIds] = useState<string[]>(draft.selectedColorIds);
  const [visibilityAudience, setVisibilityAudience] = useState<VisibilityAudience>(
    draft.visibilityAudience,
  );
  const [hideOwnerPublicly, setHideOwnerPublicly] = useState(draft.hideOwnerPublicly);
  const [selectedSocialSignal, setSelectedSocialSignal] = useState<SocialSignalKey | null>(
    draft.selectedSocialSignal,
  );
  const [selectedInteractionBadges, setSelectedInteractionBadges] = useState<InteractionBadgeKey[]>(
    draft.selectedInteractionBadges,
  );
  const [selectedConventionIds, setSelectedConventionIds] = useState<Set<string>>(
    new Set(draft.selectedConventionIds),
  );
  const [pendingMemberships, setPendingMemberships] = useState<Set<string>>(new Set());
  const [conventionError, setConventionError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const hasAppliedDefaultConventionsRef = useRef(draft.selectedConventionIds.length > 0);
  const colorLoadError = colorError
    ? getUserVisibleErrorMessage(colorError, 'We could not load colors.')
    : null;
  const isColorBusy = isColorLoading;
  const hasLoadedProfile = profile !== undefined;
  const canUseAdultsOnlyFursuitVisibility =
    profile?.is_adult === true && !profileNeedsAgeAttestation(profile);
  const profileAlreadyAdultsOnly = profile?.visibility_audience === 'adults_only';

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

  const conventionMembershipById = useMemo(
    () =>
      new Map(
        profileConventionMemberships.map((membership) => [membership.convention_id, membership]),
      ),
    [profileConventionMemberships],
  );

  const isConventionsBusy = isConventionsLoading || isProfileConventionsLoading;
  const conventionsLoadError = conventionsError
    ? getUserVisibleErrorMessage(conventionsError, 'We could not load conventions.')
    : profileConventionsError
      ? getUserVisibleErrorMessage(profileConventionsError, 'We could not load your conventions.')
      : null;

  const selectedColors = useMemo(
    () =>
      selectedColorIds
        .map((colorId) => colorOptions.find((option) => option.id === colorId))
        .filter((option): option is FursuitColorOption => Boolean(option)),
    [colorOptions, selectedColorIds],
  );

  const speciesSuggestions = useMemo(
    () =>
      buildFursuitSpeciesSuggestions({
        speciesOptions,
        selectedSpecies: [],
        input: speciesInput,
      }),
    [speciesInput, speciesOptions],
  );

  const selectConventionForSuit = useCallback((conventionId: string) => {
    setSelectedConventionIds((current) => {
      if (current.has(conventionId)) {
        return current;
      }

      return new Set([...current, conventionId]);
    });
  }, []);

  const unselectConventionForSuit = useCallback((conventionId: string) => {
    setSelectedConventionIds((current) => {
      if (!current.has(conventionId)) {
        return current;
      }

      const next = new Set(current);
      next.delete(conventionId);
      return next;
    });
  }, []);

  const { verifyConvention, verificationModals, isVerifyingConvention } =
    useConventionVerificationAction({
      profileId: userId,
      onVerified: async (convention) => {
        setConventionError(null);
        selectConventionForSuit(convention.id);
        await refetchProfileConventions({ throwOnError: false });
      },
    });

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (
      hasLoadedProfile &&
      !canUseAdultsOnlyFursuitVisibility &&
      visibilityAudience === 'adults_only'
    ) {
      setVisibilityAudience('everyone');
    }
  }, [canUseAdultsOnlyFursuitVisibility, hasLoadedProfile, visibilityAudience]);

  useEffect(() => {
    if (!anonymousFursuitsEnabled && hideOwnerPublicly) {
      setHideOwnerPublicly(false);
    }
  }, [anonymousFursuitsEnabled, hideOwnerPublicly]);

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
      photoCreditInput,
      showPhotoCreditInput,
      selectedColorIds,
      selectedConventionIds: [...selectedConventionIds],
      selectedPhoto,
      hideOwnerPublicly,
      visibilityAudience,
      selectedSocialSignal,
      selectedInteractionBadges,
    });
  }, [
    descriptionInput,
    hideOwnerPublicly,
    isExpanded,
    nameInput,
    onDraftChange,
    photoCreditInput,
    selectedColorIds,
    selectedConventionIds,
    selectedInteractionBadges,
    selectedPhoto,
    selectedSocialSignal,
    showPhotoCreditInput,
    speciesInput,
    visibilityAudience,
  ]);

  useEffect(() => {
    if (isProfileConventionsLoading) {
      return;
    }

    setSelectedConventionIds((current) => {
      if (!hasAppliedDefaultConventionsRef.current && current.size === 0) {
        hasAppliedDefaultConventionsRef.current = true;
        return new Set(profileConventionIdSet);
      }

      const filtered = new Set([...current].filter((id) => profileConventionIdSet.has(id)));
      return filtered.size === current.size ? current : filtered;
    });
  }, [isProfileConventionsLoading, profileConventionIdSet]);

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
    async (
      conventionId: string,
      nextSelected: boolean,
      verifiedLocation?: VerifiedLocation | null,
    ) => {
      if (isSubmitting) {
        return;
      }

      setConventionError(null);

      if (!nextSelected) {
        unselectConventionForSuit(conventionId);
        return;
      }

      if (profileConventionIdSet.has(conventionId)) {
        selectConventionForSuit(conventionId);
        return;
      }

      const key = `profile:${userId}:${conventionId}`;

      if (pendingMemberships.has(key)) {
        return;
      }

      setPendingMemberships((current) => {
        const next = new Set(current);
        next.add(key);
        return next;
      });

      try {
        await optInToConvention({
          profileId: userId,
          conventionId,
          verifiedLocation: verifiedLocation ?? undefined,
          verificationMethod: verifiedLocation ? 'gps' : 'none',
        });
        selectConventionForSuit(conventionId);
        await Promise.all([
          refetchProfileConventions({ throwOnError: false }),
          queryClient.invalidateQueries({
            queryKey: [ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY, userId],
          }),
          queryClient.invalidateQueries({ queryKey: [MY_SUITS_QUERY_KEY, userId] }),
        ]);
      } catch (caught) {
        captureHandledException(caught, {
          scope: 'onboarding.fursuitStep.handleConventionToggle',
          additionalContext: {
            conventionId,
            userId,
            verifiedLocationProvided: Boolean(verifiedLocation),
          },
        });
        setConventionError(
          getUserVisibleErrorMessage(
            caught,
            'We could not update your convention attendance right now. Please try again.',
          ),
        );
      } finally {
        setPendingMemberships((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [
      isSubmitting,
      pendingMemberships,
      profileConventionIdSet,
      queryClient,
      refetchProfileConventions,
      selectConventionForSuit,
      unselectConventionForSuit,
      userId,
    ],
  );

  const handleSpeciesSuggestionSelect = useCallback((speciesName: string) => {
    Keyboard.dismiss();
    setSpeciesInput(speciesName);
  }, []);

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
      setPhotoError(
        getUserVisibleErrorMessage(
          caught,
          'We could not open your photo library. Please try again.',
        ),
      );
    }
  };

  const handleClearPhoto = () => {
    if (isProcessingPhoto) {
      return;
    }

    void deleteDraftPhoto(userId, selectedPhoto);
    setSelectedPhoto(null);
    setPhotoCreditInput('');
    setShowPhotoCreditInput(false);
    setPhotoError(null);
  };

  const resetForm = () => {
    const emptyDraft = createEmptyFursuitDraft();
    setIsExpanded(emptyDraft.isExpanded);
    setNameInput(emptyDraft.nameInput);
    setSpeciesInput(emptyDraft.speciesInput);
    setDescriptionInput(emptyDraft.descriptionInput);
    setPhotoCreditInput(emptyDraft.photoCreditInput);
    setShowPhotoCreditInput(emptyDraft.showPhotoCreditInput);
    setSelectedColorIds(emptyDraft.selectedColorIds);
    setSelectedConventionIds(new Set(profileConventionIdSet));
    setHideOwnerPublicly(false);
    setVisibilityAudience('everyone');
    setSelectedSocialSignal(emptyDraft.selectedSocialSignal);
    setSelectedInteractionBadges(emptyDraft.selectedInteractionBadges);
    hasAppliedDefaultConventionsRef.current = true;
    setSelectedPhoto(null);
    setPhotoError(null);
    setSubmitError(null);
    onDraftChange({
      ...emptyDraft,
      selectedConventionIds: [...profileConventionIdSet],
      visibilityAudience: 'everyone',
    });
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

    if (visibilityAudience === 'adults_only' && !canUseAdultsOnlyFursuitVisibility) {
      setSubmitError('Confirm you are 18 or older to use 18+ visibility.');
      return;
    }

    const interactionPreferencesError = getInteractionPreferencesError(selectedInteractionBadges);
    if (interactionPreferencesError) {
      setSubmitError(interactionPreferencesError);
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
        photoCredit: selectedPhoto ? photoCreditInput.trim() : '',
        colorIds,
        hideOwnerPublicly: anonymousFursuitsEnabled && hideOwnerPublicly,
        visibilityAudience,
        socialSignal: selectedSocialSignal,
        interactionBadges: selectedInteractionBadges,
      });

      const listedConventionIds = [...selectedConventionIds].filter((conventionId) =>
        profileConventionIdSet.has(conventionId),
      );

      if (listedConventionIds.length > 0) {
        await Promise.all(
          listedConventionIds.map(async (conventionId) => {
            try {
              await addFursuitConvention(fursuitId, conventionId);
            } catch (error) {
              captureHandledException(error, {
                scope: 'onboarding.fursuitStep.attachConvention',
                userId,
                fursuitId,
                conventionId,
              });
              throw error;
            }
          }),
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
      setSubmitError(
        getUserVisibleErrorMessage(
          caught,
          'We could not save that suit right now. Please try again.',
        ),
      );
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
          Fursuits are how other players recognize you, but you do not need one to play. If
          you&apos;re not bringing a suit, you can skip this and focus on catching other players.
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
              label={FURSUIT_SKIP_LABEL}
              accessibilityLabel={FURSUIT_SKIP_ACCESSIBILITY_LABEL}
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
              {speciesSuggestions.length > 0 ? (
                <View style={styles.speciesSuggestionSection}>
                  <Text style={styles.helperLabel}>
                    {speciesInput.trim() ? 'Matching species' : 'Popular species'}
                  </Text>
                  <View style={styles.speciesSuggestionList}>
                    {speciesSuggestions.map((suggestion) => (
                      <Pressable
                        key={suggestion.key}
                        accessibilityRole="button"
                        onPress={() => handleSpeciesSuggestionSelect(suggestion.name)}
                        style={styles.colorChip}
                        disabled={isSubmitting}
                      >
                        <Text style={styles.colorChipLabel}>{suggestion.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Fursuit visibility</Text>
              <Text style={styles.helperLabel}>
                18+ visibility limits this fursuit to players who have confirmed they are 18 or
                older. It does not allow adult or sexual content.
              </Text>
              {profileAlreadyAdultsOnly ? (
                <Text style={styles.helperLabel}>
                  Your profile uses 18+ visibility, so this fursuit is already restricted by your
                  profile setting.
                </Text>
              ) : null}
              <View style={styles.visibilityOptions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: visibilityAudience === 'everyone' }}
                  disabled={isSubmitting}
                  onPress={() => setVisibilityAudience('everyone')}
                  style={({ pressed }) => [
                    styles.visibilityOption,
                    visibilityAudience === 'everyone' && styles.visibilityOptionSelected,
                    pressed && styles.visibilityOptionPressed,
                  ]}
                >
                  <View style={styles.visibilityOptionText}>
                    <Text
                      style={[
                        styles.visibilityOptionTitle,
                        visibilityAudience === 'everyone' && styles.visibilityOptionTitleSelected,
                      ]}
                    >
                      Everyone
                    </Text>
                    <Text style={styles.visibilityOptionDescription}>
                      Any signed-in player can view this fursuit.
                    </Text>
                  </View>
                  {visibilityAudience === 'everyone' ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={colors.primary}
                    />
                  ) : null}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: visibilityAudience === 'adults_only',
                    disabled: isSubmitting || !canUseAdultsOnlyFursuitVisibility,
                  }}
                  disabled={isSubmitting || !canUseAdultsOnlyFursuitVisibility}
                  onPress={() => setVisibilityAudience('adults_only')}
                  style={({ pressed }) => [
                    styles.visibilityOption,
                    visibilityAudience === 'adults_only' && styles.visibilityOptionSelected,
                    !canUseAdultsOnlyFursuitVisibility && styles.visibilityOptionDisabled,
                    pressed && styles.visibilityOptionPressed,
                  ]}
                >
                  <View style={styles.visibilityOptionText}>
                    <Text
                      style={[
                        styles.visibilityOptionTitle,
                        visibilityAudience === 'adults_only' &&
                          styles.visibilityOptionTitleSelected,
                        !canUseAdultsOnlyFursuitVisibility && styles.visibilityOptionTitleDisabled,
                      ]}
                    >
                      18+ visibility
                    </Text>
                    <Text
                      style={[
                        styles.visibilityOptionDescription,
                        !canUseAdultsOnlyFursuitVisibility &&
                          styles.visibilityOptionDescriptionDisabled,
                      ]}
                    >
                      Only players who have confirmed they are 18 or older can view this fursuit.
                    </Text>
                  </View>
                  {visibilityAudience === 'adults_only' ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={colors.primary}
                    />
                  ) : null}
                </Pressable>
              </View>
              {hasLoadedProfile && !canUseAdultsOnlyFursuitVisibility ? (
                <Text style={styles.helperLabel}>
                  Confirm you are 18 or older to use 18+ visibility.
                </Text>
              ) : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Colors</Text>
              <Text style={styles.helperLabel}>Optional. Pick up to three colors.</Text>
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
                      <Text style={styles.helperLabel}>No colors selected.</Text>
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
              {selectedPhoto ? (
                showPhotoCreditInput ? (
                  <View style={styles.helperColumn}>
                    <Text style={styles.helperLabel}>
                      Credit the photographer for your fursuit photo, if you want to share one.
                    </Text>
                    <TailTagInput
                      value={photoCreditInput}
                      onChangeText={setPhotoCreditInput}
                      placeholder="Photographer name, handle, or credit line"
                      editable={!isSubmitting}
                      returnKeyType="next"
                    />
                  </View>
                ) : (
                  <TailTagButton
                    variant="outline"
                    size="sm"
                    onPress={() => setShowPhotoCreditInput(true)}
                    disabled={isSubmitting}
                  >
                    Add photo credit
                  </TailTagButton>
                )
              ) : null}
              {photoError ? <Text style={styles.error}>{photoError}</Text> : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Interaction preferences</Text>
              <InteractionPreferencesEditor
                socialSignal={selectedSocialSignal}
                selectedBadges={selectedInteractionBadges}
                onSocialSignalChange={setSelectedSocialSignal}
                onBadgesChange={setSelectedInteractionBadges}
                disabled={isSubmitting}
              />
            </View>

            {anonymousFursuitsEnabled ? (
              <View style={styles.fieldGroup}>
                <View style={styles.switchRow}>
                  <View style={styles.switchText}>
                    <Text style={styles.label}>Hide owner publicly</Text>
                    <Text style={styles.helperLabel}>
                      Players can still catch this suit, but they will not see that it belongs to
                      you.
                    </Text>
                  </View>
                  <Switch
                    value={hideOwnerPublicly}
                    onValueChange={setHideOwnerPublicly}
                    disabled={isSubmitting}
                    accessibilityRole="switch"
                    accessibilityLabel="Hide owner publicly"
                    accessibilityHint="Controls whether other players can see you own this fursuit."
                    trackColor={{ false: colors.borderStrong, true: colors.primaryBorder }}
                    thumbColor={hideOwnerPublicly ? colors.primary : colors.textMuted}
                  />
                </View>
              </View>
            ) : null}

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
              ) : (
                <View style={styles.conventionList}>
                  {conventions.map((convention) => {
                    const isAllowed = profileConventionIdSet.has(convention.id);
                    const isSelected = selectedConventionIds.has(convention.id);
                    const membership = conventionMembershipById.get(convention.id);
                    const membershipKey = `profile:${userId}:${convention.id}`;
                    const isPending = pendingMemberships.has(membershipKey);

                    return (
                      <ConventionToggle
                        key={convention.id}
                        convention={convention}
                        selected={isSelected}
                        pending={isPending || isVerifyingConvention}
                        disabled={isSubmitting}
                        badgeText={
                          isSelected
                            ? 'Listed'
                            : membership?.membership_state === 'needs_location_verification'
                              ? 'Verify location'
                              : isAllowed
                                ? 'List suit'
                                : 'Attend'
                        }
                        membershipState={membership?.membership_state}
                        profileId={userId}
                        onVerifyLocation={verifyConvention}
                        onToggle={(conventionId, nextSelected, verifiedLocation) =>
                          void handleConventionToggle(conventionId, nextSelected, verifiedLocation)
                        }
                      />
                    );
                  })}
                </View>
              )}
              {conventionError ? <Text style={styles.error}>{conventionError}</Text> : null}
              {verificationModals}
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
                label={FURSUIT_SKIP_LABEL}
                accessibilityLabel={FURSUIT_SKIP_ACCESSIBILITY_LABEL}
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
