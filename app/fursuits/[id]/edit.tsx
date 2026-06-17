import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  Switch,
  Text,
  View,
  type LayoutChangeEvent,
  type ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { AppImage } from '../../../src/components/ui/AppImage';
import { TailTagButton } from '../../../src/components/ui/TailTagButton';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { TailTagInput } from '../../../src/components/ui/TailTagInput';
import { KeyboardAwareFormWrapper } from '../../../src/components/ui/KeyboardAwareFormWrapper';
import {
  CAUGHT_SUITS_QUERY_KEY,
  FursuitBio,
  fetchFursuitDetail,
  fursuitDetailQueryKey,
  MY_SUITS_QUERY_KEY,
  MY_SUITS_COUNT_QUERY_KEY,
} from '../../../src/features/suits';
import {
  createEmptyFursuitMaker,
  createInitialFursuitMakers,
  FURSUIT_MAKER_LIMIT,
  fursuitMakersToSave,
  hasDuplicateFursuitMakers,
  type EditableFursuitMaker,
} from '../../../src/features/suits/forms/makers';
import {
  addFursuitConvention,
  CONVENTIONS_STALE_TIME,
  CONVENTION_SUIT_ROSTER_QUERY_KEY,
  createJoinableConventionsQueryOptions,
  fetchProfileConventionMemberships,
  removeFursuitConvention,
  PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY,
  type ConventionMembership,
  type FursuitConventionRosterSettings,
} from '../../../src/features/conventions';
import { ConventionToggle } from '../../../src/components/conventions/ConventionToggle';
import { FursuitConventionRosterControls } from '../../../src/components/conventions/FursuitConventionRosterControls';
import { createProfileQueryOptions } from '../../../src/features/profile';
import {
  ensureSpeciesEntry,
  fetchFursuitSpecies,
  FURSUIT_SPECIES_QUERY_KEY,
  normalizeSpeciesName,
  sortSpeciesOptions,
  type FursuitSpeciesOption,
} from '../../../src/features/species';
import {
  fetchFursuitColors,
  FURSUIT_COLORS_QUERY_KEY,
  MAX_FURSUIT_COLORS,
  type FursuitColorOption,
} from '../../../src/features/colors';
import { useAuth } from '../../../src/features/auth';
import { supabase } from '../../../src/lib/supabase';
import { FURSUIT_BUCKET } from '../../../src/constants/storage';
import { loadUriAsUint8Array } from '../../../src/utils/files';
import {
  processImageForUpload,
  IMAGE_UPLOAD_PRESETS,
  extractStoragePath,
} from '../../../src/utils/images';
import { launchFursuitPhotoPickerAsync } from '../../../src/utils/imagePicker';
import { buildAuthenticatedStorageObjectUrl } from '../../../src/utils/supabase-image';
import { colors } from '../../../src/theme';
import { styles } from '../../../src/app-styles/fursuits/[id]/edit.styles';
import { captureHandledException } from '../../../src/lib/sentry';
import { getUserVisibleErrorMessage } from '@/lib/userVisibleErrors';
import {
  profileNeedsAgeAttestation,
  refreshAdultBoundaryCaches,
  type VisibilityAudience,
} from '../../../src/features/adult-boundary';
import { normalizeUniqueCodeInput, isValidUniqueCodeInput } from '../../../src/utils/code';
import {
  ANONYMOUS_FURSUITS_FEATURE_KEY,
  featureFlagQueryKey,
  isFeatureEnabledForProfile,
} from '../../../src/features/feature-flags';
import {
  InteractionPreferencesEditor,
  getInteractionPreferencesError,
  type InteractionBadgeKey,
  type SocialSignalKey,
} from '@/features/interaction-preferences';

const PRONOUN_OPTIONS = [
  'he/him',
  'she/her',
  'they/them',
  'it/its',
  'he/they',
  'she/they',
  'any pronouns',
] as const;

const DEFAULT_ROSTER_SETTINGS: FursuitConventionRosterSettings = {
  rosterVisible: true,
};

const ASK_ME_ABOUT_SUGGESTIONS = [
  'My suit',
  'Suit making',
  'Photography',
  'Local cons',
  'Gaming',
  'Character lore',
  'Good food nearby',
] as const;

type UploadCandidate = {
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
} | null;

type DetailConventionAssignment = {
  id: string;
  roster_visible: boolean;
};

export default function EditFursuitScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const params = useLocalSearchParams<{ id?: string; focus?: string }>();
  const fursuitId = typeof params.id === 'string' ? params.id : null;
  const shouldFocusInteractionPreferences = params.focus === 'interactionPreferences';
  const formScrollRef = useRef<ScrollView>(null);
  const hasFocusedInteractionPreferencesRef = useRef(false);
  const [interactionPreferencesOffset, setInteractionPreferencesOffset] = useState<number | null>(
    null,
  );

  const {
    data: speciesOptions = [],
    error: speciesError,
    isLoading: isSpeciesLoading,
    refetch: refetchSpecies,
  } = useQuery<FursuitSpeciesOption[], Error>({
    queryKey: [FURSUIT_SPECIES_QUERY_KEY],
    queryFn: fetchFursuitSpecies,
    staleTime: 12 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

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

  const {
    data: detail,
    isLoading,
    error,
    refetch,
  } = useQuery({
    enabled: Boolean(fursuitId && userId),
    queryKey: fursuitDetailQueryKey(fursuitId ?? '', userId),
    queryFn: () => fetchFursuitDetail(fursuitId ?? '', userId),
    staleTime: 0,
  });

  const conventionsQueryOptions = useMemo(() => createJoinableConventionsQueryOptions(), []);
  const {
    data: conventions = [],
    error: conventionsError,
    isLoading: isConventionsLoading,
    refetch: refetchConventions,
  } = useQuery({
    ...conventionsQueryOptions,
    enabled: Boolean(userId),
  });

  const { data: profile } = useQuery({
    ...createProfileQueryOptions(userId!),
    enabled: Boolean(userId),
  });

  const { data: anonymousFursuitsEnabled = false } = useQuery({
    queryKey: userId
      ? featureFlagQueryKey(ANONYMOUS_FURSUITS_FEATURE_KEY, userId)
      : [ANONYMOUS_FURSUITS_FEATURE_KEY, 'guest'],
    queryFn: () => isFeatureEnabledForProfile(ANONYMOUS_FURSUITS_FEATURE_KEY, userId!),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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

  const [selectedConventionIds, setSelectedConventionIds] = useState<Set<string>>(new Set());
  const [initialConventionIds, setInitialConventionIds] = useState<Set<string>>(new Set());
  const [conventionRosterSettingsById, setConventionRosterSettingsById] = useState<
    Record<string, FursuitConventionRosterSettings>
  >({});
  const [initialConventionRosterSettingsById, setInitialConventionRosterSettingsById] = useState<
    Record<string, FursuitConventionRosterSettings>
  >({});

  const profileConventionIdSet = useMemo(
    () => new Set(profileConventionMemberships.map((membership) => membership.convention_id)),
    [profileConventionMemberships],
  );

  const isConventionsBusy = isConventionsLoading || isProfileConventionsLoading;
  const conventionsLoadError = conventionsError
    ? getUserVisibleErrorMessage(conventionsError, 'We could not load conventions.')
    : profileConventionsError
      ? getUserVisibleErrorMessage(profileConventionsError, 'We could not load your conventions.')
      : null;

  const hasHydratedFormRef = useRef(false);
  const hasTouchedConventionRosterRef = useRef(false);
  const [nameInput, setNameInput] = useState('');
  const [speciesInput, setSpeciesInput] = useState('');
  const [selectedPronouns, setSelectedPronouns] = useState<string[]>([]);
  const [photoCreditInput, setPhotoCreditInput] = useState('');
  const [likesInput, setLikesInput] = useState('');
  const [askMeAboutInput, setAskMeAboutInput] = useState('');
  const [makers, setMakers] = useState<EditableFursuitMaker[]>(() => createInitialFursuitMakers());
  const [initialMakers, setInitialMakers] = useState<EditableFursuitMaker[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState<FursuitSpeciesOption | null>(null);
  const [selectedColors, setSelectedColors] = useState<FursuitColorOption[]>([]);
  const [initialColors, setInitialColors] = useState<FursuitColorOption[]>([]);
  const [selectedVisibilityAudience, setSelectedVisibilityAudience] =
    useState<VisibilityAudience>('everyone');
  const [initialVisibilityAudience, setInitialVisibilityAudience] =
    useState<VisibilityAudience>('everyone');
  const [hideOwnerPublicly, setHideOwnerPublicly] = useState(false);
  const [initialHideOwnerPublicly, setInitialHideOwnerPublicly] = useState(false);
  const [selectedSocialSignal, setSelectedSocialSignal] = useState<SocialSignalKey | null>(null);
  const [selectedInteractionBadges, setSelectedInteractionBadges] = useState<InteractionBadgeKey[]>(
    [],
  );
  const [selectedPhoto, setSelectedPhoto] = useState<UploadCandidate>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [initialCode, setInitialCode] = useState('');
  const [isCheckingCode, setIsCheckingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const codeCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speciesLoadError = speciesError
    ? getUserVisibleErrorMessage(speciesError, 'We could not load species.')
    : null;
  const isSpeciesBusy = isSpeciesLoading;
  const colorLoadError = colorError
    ? getUserVisibleErrorMessage(colorError, 'We could not load colors.')
    : null;
  const isColorBusy = isColorLoading;
  const hasLoadedProfile = profile !== undefined;
  const canUseAdultsOnlyFursuitVisibility =
    profile?.is_adult === true && !profileNeedsAgeAttestation(profile);
  const profileAlreadyAdultsOnly = profile?.visibility_audience === 'adults_only';

  const normalizedSpeciesInput = useMemo(() => normalizeSpeciesName(speciesInput), [speciesInput]);

  const speciesSuggestions = useMemo(() => {
    if (speciesOptions.length === 0) {
      return [] as FursuitSpeciesOption[];
    }

    if (!normalizedSpeciesInput) {
      return speciesOptions.slice(0, 12);
    }

    return speciesOptions
      .filter((option) => option.normalizedName.includes(normalizedSpeciesInput))
      .slice(0, 12);
  }, [normalizedSpeciesInput, speciesOptions]);

  const handleSpeciesInputChange = useCallback(
    (value: string) => {
      setSpeciesInput(value);

      const normalized = normalizeSpeciesName(value);

      if (!normalized) {
        setSelectedSpecies(null);
        return;
      }

      const match = speciesOptions.find((option) => option.normalizedName === normalized) ?? null;
      setSelectedSpecies(match);
    },
    [speciesOptions],
  );

  const handleSpeciesSelect = useCallback((option: FursuitSpeciesOption) => {
    setSpeciesInput(option.name);
    setSelectedSpecies(option);
  }, []);

  const handleTogglePronoun = useCallback((option: string) => {
    Keyboard.dismiss();
    setSelectedPronouns((current) => {
      if (current.includes(option)) {
        return current.filter((p) => p !== option);
      }
      return [...current, option];
    });
  }, []);

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

  const applyConventionRosterState = useCallback(
    (detailConventions: DetailConventionAssignment[]) => {
      const eligibleConventions = (detailConventions ?? []).filter((entry) =>
        profileConventionIdSet.has(entry.id),
      );
      const initialConventionSet = new Set(eligibleConventions.map((entry) => entry.id));
      const initialRosterSettings = Object.fromEntries(
        eligibleConventions.map((entry) => [
          entry.id,
          {
            rosterVisible: entry.roster_visible !== false,
          } satisfies FursuitConventionRosterSettings,
        ]),
      );

      setSelectedConventionIds(new Set(initialConventionSet));
      setInitialConventionIds(initialConventionSet);
      setConventionRosterSettingsById(initialRosterSettings);
      setInitialConventionRosterSettingsById(initialRosterSettings);
    },
    [profileConventionIdSet],
  );

  useEffect(() => {
    if (!detail || hasHydratedFormRef.current || isProfileConventionsLoading) {
      return;
    }

    setNameInput(detail.name ?? '');
    setSpeciesInput(detail.species ?? '');

    if (detail.species && detail.speciesId) {
      setSelectedSpecies({
        id: detail.speciesId,
        name: detail.species,
        normalizedName: normalizeSpeciesName(detail.species),
      });
    } else {
      setSelectedSpecies(null);
    }

    const bio: FursuitBio | null = detail.bio;

    const savedPronouns = bio?.pronouns ?? '';
    const parsedPronouns = savedPronouns
      .split(',')
      .map((p) => p.trim())
      .filter((p) => (PRONOUN_OPTIONS as readonly string[]).includes(p));
    setSelectedPronouns(parsedPronouns);
    setPhotoCreditInput(bio?.photoCredit ?? '');
    setLikesInput(bio?.likesAndInterests ?? '');
    setAskMeAboutInput(bio?.askMeAbout ?? '');

    const mappedMakers =
      detail.makers.length > 0
        ? detail.makers.map((maker) => ({
            id: maker.id,
            name: maker.name,
          }))
        : createInitialFursuitMakers();
    setMakers(mappedMakers);
    setInitialMakers(mappedMakers);

    applyConventionRosterState(detail.conventions ?? []);
    const resolvedColors = detail.colors ?? [];
    setSelectedColors(resolvedColors);
    setInitialColors(resolvedColors);
    setSelectedVisibilityAudience(detail.visibility_audience);
    setInitialVisibilityAudience(detail.visibility_audience);
    setHideOwnerPublicly(detail.ownerAttributionVisibility === 'hidden');
    setInitialHideOwnerPublicly(detail.ownerAttributionVisibility === 'hidden');
    setSelectedSocialSignal(detail.socialSignal);
    setSelectedInteractionBadges(detail.interactionBadges);
    const normalizedCode = normalizeUniqueCodeInput(detail.unique_code ?? '');
    setCodeInput(normalizedCode);
    setInitialCode(normalizedCode);

    hasHydratedFormRef.current = true;
  }, [applyConventionRosterState, detail, isProfileConventionsLoading]);

  useEffect(() => {
    if (
      !detail ||
      !hasHydratedFormRef.current ||
      hasTouchedConventionRosterRef.current ||
      isProfileConventionsLoading
    ) {
      return;
    }

    applyConventionRosterState(detail.conventions ?? []);
  }, [applyConventionRosterState, detail, isProfileConventionsLoading]);

  const isOwner = useMemo(() => {
    if (!detail || !userId) {
      return false;
    }

    return detail.owner_id === userId;
  }, [detail, userId]);

  useEffect(() => {
    hasFocusedInteractionPreferencesRef.current = false;
  }, [fursuitId, shouldFocusInteractionPreferences]);

  const handleInteractionPreferencesLayout = useCallback((event: LayoutChangeEvent) => {
    setInteractionPreferencesOffset(event.nativeEvent.layout.y);
  }, []);

  useEffect(() => {
    if (
      !shouldFocusInteractionPreferences ||
      isLoading ||
      !isOwner ||
      interactionPreferencesOffset === null ||
      hasFocusedInteractionPreferencesRef.current
    ) {
      return;
    }

    hasFocusedInteractionPreferencesRef.current = true;
    requestAnimationFrame(() => {
      formScrollRef.current?.scrollTo({
        y: Math.max(interactionPreferencesOffset - 16, 0),
        animated: true,
      });
    });
  }, [interactionPreferencesOffset, isLoading, isOwner, shouldFocusInteractionPreferences]);

  useEffect(() => {
    if (
      hasLoadedProfile &&
      !canUseAdultsOnlyFursuitVisibility &&
      selectedVisibilityAudience === 'adults_only'
    ) {
      setSelectedVisibilityAudience('everyone');
    }
  }, [canUseAdultsOnlyFursuitVisibility, hasLoadedProfile, selectedVisibilityAudience]);

  useEffect(() => {
    if (!hasHydratedFormRef.current || !fursuitId || codeInput === initialCode) {
      return;
    }

    if (!isValidUniqueCodeInput(codeInput)) {
      return;
    }

    if (codeCheckTimeoutRef.current !== null) {
      clearTimeout(codeCheckTimeoutRef.current);
    }

    setCodeError(null);
    setIsCheckingCode(true);

    const normalized = normalizeUniqueCodeInput(codeInput);

    codeCheckTimeoutRef.current = setTimeout(async () => {
      codeCheckTimeoutRef.current = null;

      const { data: existingCode, error: codeCheckError } = await supabase
        .from('fursuits')
        .select('id')
        .eq('unique_code', normalized)
        .neq('id', fursuitId)
        .limit(1)
        .maybeSingle();

      setIsCheckingCode(false);

      if (codeCheckError) {
        setCodeError('Could not verify catch code availability. Please try again.');
        return;
      }

      if (existingCode) {
        setCodeError('That code is already taken. Try another.');
      }
    }, 400);

    return () => {
      if (codeCheckTimeoutRef.current !== null) {
        clearTimeout(codeCheckTimeoutRef.current);
        codeCheckTimeoutRef.current = null;
      }
    };
  }, [codeInput, initialCode, fursuitId]);

  const makersCanAddMore = useMemo(() => makers.length < FURSUIT_MAKER_LIMIT, [makers.length]);

  const handleMakerNameChange = useCallback((id: string, value: string) => {
    setMakers((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, name: value } : entry)),
    );
  }, []);

  const handleAddMaker = () => {
    if (!makersCanAddMore) return;
    setMakers((current) => [...current, createEmptyFursuitMaker()]);
  };

  const handleRemoveMaker = (id: string) => {
    setMakers((current) => {
      const next = current.filter((entry) => entry.id !== id);
      return next.length > 0 ? next : [createEmptyFursuitMaker()];
    });
  };

  const handlePickPhoto = useCallback(async () => {
    try {
      const result = await launchFursuitPhotoPickerAsync();

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];

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
        setSelectedPhoto({
          uri: processed.uri,
          mimeType: 'image/jpeg',
          fileName: `fursuit-${Date.now()}.jpg`,
          fileSize: 0,
        });
      } catch {
        setPhotoError('We could not process that photo. Please try another.');
      } finally {
        setIsProcessingPhoto(false);
      }
    } catch (caught) {
      setPhotoError(
        getUserVisibleErrorMessage(
          caught,
          'We could not open your photo library. Please try again.',
        ),
      );
    }
  }, []);

  const handleClearPhoto = () => {
    setSelectedPhoto(null);
    setPhotoError(null);
  };

  const handleCancel = () => {
    router.back();
  };

  const handleDelete = useCallback(() => {
    if (!detail || !fursuitId || !userId || isSubmitting || isDeleting) {
      return;
    }

    Alert.alert(
      'Delete fursuit?',
      `Delete ${detail.name} from your fursuits? This removes the suit profile and cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete fursuit',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            setSubmitError(null);

            try {
              const objectPath =
                detail.avatar_path ?? extractStoragePath(detail.avatar_url ?? null, FURSUIT_BUCKET);

              if (objectPath) {
                const { error: storageError } = await supabase.storage
                  .from(FURSUIT_BUCKET)
                  .remove([objectPath]);

                if (storageError) {
                  console.warn('Failed to remove fursuit avatar from storage', storageError);
                }
              }

              const { error: deleteError } = await (supabase as any)
                .from('fursuits')
                .delete()
                .eq('id', fursuitId)
                .eq('owner_id', userId);

              if (deleteError) {
                throw deleteError;
              }

              queryClient.invalidateQueries({
                queryKey: fursuitDetailQueryKey(fursuitId),
              });
              queryClient.invalidateQueries({ queryKey: [MY_SUITS_QUERY_KEY, userId] });
              queryClient.invalidateQueries({
                queryKey: [MY_SUITS_COUNT_QUERY_KEY, userId],
              });
              queryClient.invalidateQueries({
                queryKey: [CAUGHT_SUITS_QUERY_KEY, userId],
              });

              router.replace('/suits');
            } catch (caught) {
              setSubmitError(
                getUserVisibleErrorMessage(
                  caught,
                  "We couldn't delete that fursuit. Please try again.",
                ),
              );
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  }, [detail, fursuitId, isDeleting, isSubmitting, queryClient, router, userId]);

  const handleSubmit = async () => {
    if (!detail || !fursuitId || !userId || isSubmitting) {
      return;
    }

    const trimmedName = nameInput.trim();
    const trimmedSpecies = speciesInput.trim();
    const trimmedPronouns = selectedPronouns.join(', ');
    const trimmedPhotoCredit = photoCreditInput.trim();
    const trimmedLikes = likesInput.trim();
    const trimmedAskMeAbout = askMeAboutInput.trim();
    const normalizedSpeciesValue = normalizeSpeciesName(trimmedSpecies);

    const normalizedMakers = fursuitMakersToSave(makers);
    const selectedColorIds = selectedColors.map((color) => color.id);
    const previousColors = initialColors;
    const previousColorIds = previousColors.map((color) => color.id);

    if (!trimmedName) {
      setSubmitError('Give your fursuit a name before saving.');
      return;
    }

    if (!trimmedSpecies) {
      setSubmitError('Add your fursuit species before saving.');
      return;
    }

    if (selectedColorIds.length > MAX_FURSUIT_COLORS) {
      setSubmitError('You can choose up to three colors. Remove one to add another.');
      return;
    }

    if (normalizedMakers.length > FURSUIT_MAKER_LIMIT) {
      setSubmitError(`You can add up to ${FURSUIT_MAKER_LIMIT} fursuit makers.`);
      return;
    }

    if (hasDuplicateFursuitMakers(normalizedMakers)) {
      setSubmitError('Remove duplicate fursuit maker names before saving.');
      return;
    }

    const interactionPreferencesError = getInteractionPreferencesError(selectedInteractionBadges);
    if (interactionPreferencesError) {
      setSubmitError(interactionPreferencesError);
      return;
    }

    if (selectedVisibilityAudience === 'adults_only' && !canUseAdultsOnlyFursuitVisibility) {
      setSubmitError('Confirm you are 18 or older to use 18+ visibility.');
      return;
    }
    const normalizedCode = normalizeUniqueCodeInput(codeInput);
    const codeChanged = normalizedCode !== initialCode;

    if (codeChanged) {
      if (!isValidUniqueCodeInput(normalizedCode)) {
        setCodeError('Catch code must be 4\u20138 letters or numbers.');
        return;
      }

      setCodeError(null);
      setIsCheckingCode(true);

      const { data: existingCode, error: codeCheckError } = await supabase
        .from('fursuits')
        .select('id')
        .eq('unique_code', normalizedCode)
        .neq('id', fursuitId)
        .limit(1)
        .maybeSingle();

      setIsCheckingCode(false);

      if (codeCheckError) {
        setCodeError('Could not verify catch code availability. Please try again.');
        return;
      }

      if (existingCode) {
        setCodeError('That code is already taken. Try another.');
        return;
      }
    }

    const toAdd = Array.from(selectedConventionIds).filter(
      (id) => !initialConventionIds.has(id) && profileConventionIdSet.has(id),
    );
    const toRemove = Array.from(initialConventionIds).filter(
      (id) => !selectedConventionIds.has(id),
    );
    const toUpdateRosterSettings = Array.from(selectedConventionIds).filter((id) => {
      if (toAdd.includes(id) || toRemove.includes(id)) {
        return false;
      }

      const current = conventionRosterSettingsById[id] ?? DEFAULT_ROSTER_SETTINGS;
      const initial = initialConventionRosterSettingsById[id] ?? DEFAULT_ROSTER_SETTINGS;
      return current.rosterVisible !== initial.rosterVisible;
    });

    setIsSubmitting(true);
    setSubmitError(null);

    const client = supabase as any;
    const previousName = detail.name;
    const previousSpeciesId = detail.speciesId ?? null;
    const previousAvatarPath = detail.avatar_path ?? null;
    const previousAvatarUrl = detail.avatar_url;
    const previousVisibilityAudience = detail.visibility_audience;
    const previousUniqueCode = detail.unique_code ?? null;
    const previousSocialSignal = detail.socialSignal;
    const previousInteractionBadges = detail.interactionBadges;
    const initialNormalizedMakers = fursuitMakersToSave(initialMakers);
    let updatedCoreRecord = false;
    let replacedColors = false;
    const addedConventionIds: string[] = [];
    const removedConventionIds: string[] = [];
    const updatedRosterConventionIds: string[] = [];

    try {
      const speciesRecord =
        selectedSpecies && selectedSpecies.normalizedName === normalizedSpeciesValue
          ? selectedSpecies
          : await ensureSpeciesEntry(trimmedSpecies);

      setSelectedSpecies(speciesRecord);
      setSpeciesInput(speciesRecord.name);
      queryClient.setQueryData<FursuitSpeciesOption[]>(
        [FURSUIT_SPECIES_QUERY_KEY],
        (current = []) => {
          const existingIndex = current.findIndex((option) => option.id === speciesRecord.id);

          if (existingIndex >= 0) {
            const next = [...current];
            next[existingIndex] = speciesRecord;
            return sortSpeciesOptions(next);
          }

          return sortSpeciesOptions([...current, speciesRecord]);
        },
      );
      void queryClient.invalidateQueries({
        queryKey: [FURSUIT_SPECIES_QUERY_KEY],
      });

      let newAvatarPath: string | undefined;
      let newAvatarUrl: string | undefined;

      if (selectedPhoto) {
        const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const storagePath = `${userId}/${uniqueSuffix}.jpg`;

        const fileBytes = await loadUriAsUint8Array(selectedPhoto.uri);

        const { error: uploadError } = await supabase.storage
          .from(FURSUIT_BUCKET)
          .upload(storagePath, fileBytes, {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        newAvatarPath = storagePath;
        newAvatarUrl = buildAuthenticatedStorageObjectUrl(FURSUIT_BUCKET, storagePath);
      }

      const { error: updateError } = await client
        .from('fursuits')
        .update({
          name: trimmedName,
          species_id: speciesRecord.id,
          visibility_audience: selectedVisibilityAudience,
          owner_attribution_visibility: anonymousFursuitsEnabled
            ? hideOwnerPublicly
              ? 'hidden'
              : 'public'
            : detail.ownerAttributionVisibility,
          social_signal: selectedSocialSignal,
          interaction_badges: selectedInteractionBadges,
          ...(newAvatarPath !== undefined
            ? { avatar_path: newAvatarPath, avatar_url: newAvatarUrl }
            : {}),
          ...(codeChanged ? { unique_code: normalizedCode } : {}),
        })
        .eq('id', fursuitId)
        .eq('owner_id', userId);

      if (updateError) {
        throw updateError;
      }

      // Orphan cleanup: delete the old avatar after the DB update succeeds
      if (newAvatarUrl !== undefined) {
        const oldPath =
          detail.avatar_path ?? extractStoragePath(detail.avatar_url ?? null, FURSUIT_BUCKET);
        if (oldPath) {
          void supabase.storage
            .from(FURSUIT_BUCKET)
            .remove([oldPath])
            .catch((err) => {
              console.warn('Failed to clean up old fursuit avatar', err);
            });
        }
      }

      updatedCoreRecord = true;

      const colorsChanged =
        previousColorIds.length !== selectedColorIds.length ||
        previousColorIds.some((colorId, index) => colorId !== selectedColorIds[index]);

      if (colorsChanged) {
        const { error: clearColorsError } = await client
          .from('fursuit_color_assignments')
          .delete()
          .eq('fursuit_id', fursuitId);

        if (clearColorsError) {
          throw clearColorsError;
        }

        replacedColors = true;

        if (selectedColorIds.length > 0) {
          const colorAssignments = selectedColors.map((color, index) => ({
            fursuit_id: fursuitId,
            color_id: color.id,
            position: index + 1,
          }));

          const { error: insertColorsError } = await client
            .from('fursuit_color_assignments')
            .insert(colorAssignments);

          if (insertColorsError) {
            throw insertColorsError;
          }
        }
      }

      const makersChanged =
        initialNormalizedMakers.length !== normalizedMakers.length ||
        initialNormalizedMakers.some(
          (maker, index) =>
            maker.maker_name !== normalizedMakers[index]?.maker_name ||
            maker.normalized_maker_name !== normalizedMakers[index]?.normalized_maker_name,
        );

      if (makersChanged) {
        const { error: replaceMakersError } = await client.rpc('replace_fursuit_makers', {
          fursuit_id: fursuitId,
          makers: normalizedMakers,
        });

        if (replaceMakersError) {
          throw replaceMakersError;
        }
      }

      for (const conventionId of toAdd) {
        await addFursuitConvention(
          fursuitId,
          conventionId,
          conventionRosterSettingsById[conventionId] ?? DEFAULT_ROSTER_SETTINGS,
        );
        addedConventionIds.push(conventionId);
      }

      for (const conventionId of toUpdateRosterSettings) {
        await addFursuitConvention(
          fursuitId,
          conventionId,
          conventionRosterSettingsById[conventionId] ?? DEFAULT_ROSTER_SETTINGS,
        );
        updatedRosterConventionIds.push(conventionId);
      }

      for (const conventionId of toRemove) {
        await removeFursuitConvention(fursuitId, conventionId);
        removedConventionIds.push(conventionId);
      }

      const nextVersion = (detail.bio?.version ?? 0) + 1;

      const { error: bioError } = await client.from('fursuit_bios').insert({
        fursuit_id: fursuitId,
        version: nextVersion,
        owner_name: profile?.username ?? '',
        photo_credit: trimmedPhotoCredit,
        pronouns: trimmedPronouns,
        likes_and_interests: trimmedLikes,
        ask_me_about: trimmedAskMeAbout,
        social_links: [],
      });

      if (bioError) {
        throw bioError;
      }

      queryClient.invalidateQueries({
        queryKey: fursuitDetailQueryKey(fursuitId),
      });
      queryClient.invalidateQueries({ queryKey: [MY_SUITS_QUERY_KEY, userId] });
      queryClient.invalidateQueries({
        queryKey: [CAUGHT_SUITS_QUERY_KEY, userId],
      });
      Array.from(new Set([...toAdd, ...toRemove, ...toUpdateRosterSettings])).forEach(
        (conventionId) => {
          void queryClient.invalidateQueries({
            queryKey: [CONVENTION_SUIT_ROSTER_QUERY_KEY, userId, conventionId],
          });
        },
      );
      if (selectedVisibilityAudience !== initialVisibilityAudience) {
        try {
          await refreshAdultBoundaryCaches({ queryClient, userId });
        } catch (cacheError) {
          captureHandledException(cacheError, {
            scope: 'suits.edit.refreshAdultBoundaryCaches',
            userId,
            fursuitId,
          });
        }
      }

      setInitialConventionIds(new Set(selectedConventionIds));
      setInitialConventionRosterSettingsById(conventionRosterSettingsById);
      setInitialColors(selectedColors);
      setInitialMakers(makers);
      setInitialVisibilityAudience(selectedVisibilityAudience);
      setInitialHideOwnerPublicly(
        anonymousFursuitsEnabled
          ? hideOwnerPublicly
          : detail.ownerAttributionVisibility === 'hidden',
      );

      router.back();
    } catch (caught) {
      if (
        caught &&
        typeof caught === 'object' &&
        'code' in caught &&
        (caught as any).code === '23505'
      ) {
        setCodeError('That code is already taken. Try another.');
        setSubmitError(null);
        return;
      }

      setSubmitError(
        getUserVisibleErrorMessage(
          caught,
          "We couldn't update that fursuit right now. Please try again.",
        ),
      );

      if (addedConventionIds.length > 0) {
        await Promise.all(
          addedConventionIds.map((conventionId) =>
            removeFursuitConvention(fursuitId, conventionId).catch((revertError) => {
              console.warn('Failed to revert convention assignment after error', revertError);
            }),
          ),
        );
      }

      if (removedConventionIds.length > 0) {
        await Promise.all(
          removedConventionIds.map((conventionId) =>
            addFursuitConvention(
              fursuitId,
              conventionId,
              initialConventionRosterSettingsById[conventionId] ?? DEFAULT_ROSTER_SETTINGS,
            ).catch((revertError) => {
              console.warn('Failed to restore convention assignment after error', revertError);
            }),
          ),
        );
      }

      if (updatedRosterConventionIds.length > 0) {
        await Promise.all(
          updatedRosterConventionIds.map((conventionId) =>
            addFursuitConvention(
              fursuitId,
              conventionId,
              initialConventionRosterSettingsById[conventionId] ?? DEFAULT_ROSTER_SETTINGS,
            ).catch((revertError) => {
              console.warn('Failed to restore roster settings after error', revertError);
            }),
          ),
        );
      }

      if (replacedColors) {
        const { error: revertClearError } = await client
          .from('fursuit_color_assignments')
          .delete()
          .eq('fursuit_id', fursuitId);

        if (revertClearError) {
          console.warn('Failed to clear color assignments after error', revertClearError);
        } else if (previousColors.length > 0) {
          const revertAssignments = previousColors.map((color, index) => ({
            fursuit_id: fursuitId,
            color_id: color.id,
            position: index + 1,
          }));

          const { error: revertInsertError } = await client
            .from('fursuit_color_assignments')
            .insert(revertAssignments);

          if (revertInsertError) {
            console.warn('Failed to restore color assignments after error', revertInsertError);
          }
        }

        setSelectedColors(previousColors);
        setInitialColors(previousColors);
      }

      if (updatedCoreRecord) {
        const { error: revertError } = await client
          .from('fursuits')
          .update({
            name: previousName,
            species_id: previousSpeciesId,
            visibility_audience: previousVisibilityAudience,
            owner_attribution_visibility: detail.ownerAttributionVisibility,
            social_signal: previousSocialSignal,
            interaction_badges: previousInteractionBadges,
            unique_code: previousUniqueCode,
            avatar_path: previousAvatarPath,
            avatar_url: previousAvatarUrl,
          })
          .eq('id', fursuitId)
          .eq('owner_id', userId);

        if (revertError) {
          console.warn('Failed to revert fursuit record after edit error', revertError);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const disableForm = isLoading || !detail || !isOwner || isSubmitting || isDeleting;

  const handleConventionToggle = useCallback(
    (conventionId: string, nextSelected: boolean) => {
      if (disableForm || (nextSelected && !profileConventionIdSet.has(conventionId))) {
        return;
      }

      hasTouchedConventionRosterRef.current = true;
      setSelectedConventionIds((current) => {
        const next = new Set(current);

        if (nextSelected) {
          next.add(conventionId);
        } else {
          next.delete(conventionId);
        }

        return next;
      });

      setConventionRosterSettingsById((current) => {
        if (nextSelected) {
          return {
            ...current,
            [conventionId]: current[conventionId] ?? DEFAULT_ROSTER_SETTINGS,
          };
        }

        const next = { ...current };
        delete next[conventionId];
        return next;
      });
    },
    [disableForm, profileConventionIdSet],
  );

  const handleConventionRosterSettingsChange = useCallback(
    (conventionId: string, nextValue: FursuitConventionRosterSettings) => {
      if (disableForm) {
        return;
      }

      hasTouchedConventionRosterRef.current = true;
      setConventionRosterSettingsById((current) => ({
        ...current,
        [conventionId]: nextValue,
      }));
    },
    [disableForm],
  );

  const handleAskMeAboutSuggestion = useCallback((suggestion: string) => {
    setAskMeAboutInput((current) => {
      const existingTopics = current
        .split(',')
        .map((topic) => topic.trim())
        .filter((topic) => topic.length > 0);
      const normalizedExistingTopics = existingTopics.map((topic) => topic.toLowerCase());

      if (normalizedExistingTopics.includes(suggestion.toLowerCase())) {
        return existingTopics.join(', ');
      }

      return existingTopics.concat(suggestion).join(', ');
    });
  }, []);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Edit Fursuit"
        onBack={() => router.back()}
      />
      <KeyboardAwareFormWrapper
        ref={formScrollRef}
        contentContainerStyle={styles.container}
      >
        <View style={styles.formCard}>
          {isLoading ? (
            <Text style={styles.message}>Loading your fursuit details…</Text>
          ) : error ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorText}>
                {getUserVisibleErrorMessage(error, 'We could not load that fursuit.')}
              </Text>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={() => refetch()}
              >
                Try again
              </TailTagButton>
            </View>
          ) : !isOwner ? (
            <Text style={styles.message}>
              You can only edit suits you own. Switch accounts and try again.
            </Text>
          ) : (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Suit photo</Text>
                <View style={styles.photoRow}>
                  {isProcessingPhoto ? (
                    <View style={[styles.photoPreview, styles.photoProcessing]}>
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  ) : selectedPhoto ? (
                    <Image
                      source={selectedPhoto.uri}
                      style={styles.photoPreview}
                      contentFit="cover"
                    />
                  ) : detail?.avatar_url ? (
                    <AppImage
                      url={detail.avatar_url}
                      style={styles.photoPreview}
                    />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <Text style={styles.photoPlaceholderText}>No photo</Text>
                    </View>
                  )}
                </View>
                <View style={styles.photoButtons}>
                  <TailTagButton
                    variant="outline"
                    onPress={() => {
                      void handlePickPhoto();
                    }}
                    disabled={disableForm || isProcessingPhoto}
                  >
                    {detail?.avatar_url || selectedPhoto ? 'Change photo' : 'Choose photo'}
                  </TailTagButton>
                  {selectedPhoto ? (
                    <TailTagButton
                      variant="ghost"
                      onPress={handleClearPhoto}
                      disabled={disableForm}
                    >
                      Remove new photo
                    </TailTagButton>
                  ) : null}
                </View>
                {photoError ? <Text style={styles.errorText}>{photoError}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Photo credit</Text>
                <Text style={styles.helperLabel}>
                  Credit the photographer for your fursuit photo, if you want to share one.
                </Text>
                <TailTagInput
                  value={photoCreditInput}
                  onChangeText={setPhotoCreditInput}
                  placeholder="Photographer name, handle, or credit line"
                  editable={!disableForm}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Name</Text>
                <TailTagInput
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Eclipse the Sergal"
                  editable={!disableForm}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Species</Text>
                <TailTagInput
                  value={speciesInput}
                  onChangeText={handleSpeciesInputChange}
                  placeholder="Sergal, Dutch Angel Dragon, etc."
                  editable={!disableForm}
                  returnKeyType="next"
                  autoCapitalize="words"
                />
                <Text style={styles.helperLabel}>
                  Tap a suggestion or keep typing to add a new species to the shared list.
                </Text>
                {isSpeciesBusy ? (
                  <Text style={styles.helperLabel}>Loading species…</Text>
                ) : speciesLoadError ? (
                  <View style={styles.helperColumn}>
                    <Text style={styles.errorText}>{speciesLoadError}</Text>
                    <TailTagButton
                      variant="outline"
                      size="sm"
                      onPress={() => {
                        void refetchSpecies({ throwOnError: false });
                      }}
                      disabled={disableForm}
                    >
                      Try again
                    </TailTagButton>
                  </View>
                ) : speciesSuggestions.length > 0 ? (
                  <View style={styles.speciesSuggestionSection}>
                    <Text style={styles.helperLabel}>
                      {normalizedSpeciesInput ? 'Matching species' : 'Popular species'}
                    </Text>
                    <View style={styles.speciesSuggestionList}>
                      {speciesSuggestions.map((option) => {
                        const isSelected = selectedSpecies?.id === option.id;
                        return (
                          <Pressable
                            key={option.id}
                            accessibilityRole="button"
                            onPress={() => handleSpeciesSelect(option)}
                            style={[styles.colorChip, isSelected ? styles.colorChipSelected : null]}
                            disabled={disableForm}
                          >
                            <Text
                              style={[
                                styles.colorChipLabel,
                                isSelected ? styles.colorChipLabelSelected : null,
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
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Catch code</Text>
                <Text style={styles.helperLabel}>
                  Other players type this to catch your suit. 4-8 letters and numbers.
                </Text>
                <View style={styles.codeRow}>
                  <TailTagInput
                    value={codeInput}
                    onChangeText={(v) => setCodeInput(normalizeUniqueCodeInput(v))}
                    placeholder="Your unique catch code"
                    editable={!disableForm}
                    autoCapitalize="characters"
                    returnKeyType="next"
                    style={styles.codeInput}
                  />
                </View>
                {isCheckingCode ? (
                  <ActivityIndicator color={colors.primary} />
                ) : codeError ? (
                  <Text style={styles.errorText}>{codeError}</Text>
                ) : codeInput !== initialCode &&
                  isValidUniqueCodeInput(codeInput) &&
                  !submitError ? (
                  <Text style={styles.codeValidText}>Valid code</Text>
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
                    accessibilityState={{ selected: selectedVisibilityAudience === 'everyone' }}
                    disabled={disableForm}
                    onPress={() => setSelectedVisibilityAudience('everyone')}
                    style={({ pressed }) => [
                      styles.visibilityOption,
                      selectedVisibilityAudience === 'everyone' && styles.visibilityOptionSelected,
                      pressed && styles.visibilityOptionPressed,
                    ]}
                  >
                    <View style={styles.visibilityOptionText}>
                      <Text
                        style={[
                          styles.visibilityOptionTitle,
                          selectedVisibilityAudience === 'everyone' &&
                            styles.visibilityOptionTitleSelected,
                        ]}
                      >
                        Everyone
                      </Text>
                      <Text style={styles.visibilityOptionDescription}>
                        Any signed-in player can view this fursuit.
                      </Text>
                    </View>
                    {selectedVisibilityAudience === 'everyone' ? (
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
                      selected: selectedVisibilityAudience === 'adults_only',
                      disabled: disableForm || !canUseAdultsOnlyFursuitVisibility,
                    }}
                    disabled={disableForm || !canUseAdultsOnlyFursuitVisibility}
                    onPress={() => setSelectedVisibilityAudience('adults_only')}
                    style={({ pressed }) => [
                      styles.visibilityOption,
                      selectedVisibilityAudience === 'adults_only' &&
                        styles.visibilityOptionSelected,
                      !canUseAdultsOnlyFursuitVisibility && styles.visibilityOptionDisabled,
                      pressed && styles.visibilityOptionPressed,
                    ]}
                  >
                    <View style={styles.visibilityOptionText}>
                      <Text
                        style={[
                          styles.visibilityOptionTitle,
                          selectedVisibilityAudience === 'adults_only' &&
                            styles.visibilityOptionTitleSelected,
                          !canUseAdultsOnlyFursuitVisibility &&
                            styles.visibilityOptionTitleDisabled,
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
                    {selectedVisibilityAudience === 'adults_only' ? (
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
                      disabled={disableForm}
                      accessibilityRole="switch"
                      accessibilityLabel="Hide owner publicly"
                      accessibilityHint="Controls whether other players can see you own this fursuit."
                      trackColor={{ false: colors.borderStrong, true: colors.primaryBorder }}
                      thumbColor={hideOwnerPublicly ? colors.primary : colors.textMuted}
                    />
                  </View>
                </View>
              ) : initialHideOwnerPublicly ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Owner hidden publicly</Text>
                  <Text style={styles.helperLabel}>
                    This suit is currently hidden from public owner attribution.
                  </Text>
                </View>
              ) : null}

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Colors</Text>
                <Text style={styles.helperLabel}>Optional. Pick up to three colors.</Text>
                {isColorBusy ? (
                  <Text style={styles.helperLabel}>Loading colors…</Text>
                ) : colorLoadError ? (
                  <View style={styles.helperColumn}>
                    <Text style={styles.errorText}>{colorLoadError}</Text>
                    <TailTagButton
                      variant="outline"
                      size="sm"
                      onPress={() => {
                        void refetchColors({ throwOnError: false });
                      }}
                      disabled={disableForm}
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
                          disabled={disableForm}
                        >
                          <Text style={styles.colorSelectedText}>{color.name}</Text>
                          <Text style={styles.colorSelectedRemove}>Remove</Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={styles.colorOptionList}>
                      {colorOptions.map((option) => {
                        const isSelected = selectedColors.some((color) => color.id === option.id);
                        const isAtLimit =
                          !isSelected && selectedColors.length >= MAX_FURSUIT_COLORS;
                        return (
                          <Pressable
                            key={option.id}
                            accessibilityRole="button"
                            onPress={() => handleToggleColor(option)}
                            style={[
                              styles.colorChip,
                              isSelected ? styles.colorChipSelected : null,
                              isAtLimit ? styles.colorChipDisabled : null,
                            ]}
                            disabled={disableForm || (!isSelected && isAtLimit)}
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
                        You picked the maximum number of colors. Tap one to remove it.
                      </Text>
                    ) : null}
                  </>
                )}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Fursuit Maker</Text>
                <Text style={styles.helperLabel}>
                  Add the maker names catchers should see. You can add more than one.
                </Text>
                <View style={styles.makerList}>
                  {makers.map((maker, index) => (
                    <View
                      key={maker.id}
                      style={styles.makerRow}
                    >
                      <TailTagInput
                        value={maker.name}
                        onChangeText={(value) => handleMakerNameChange(maker.id, value)}
                        placeholder={index === 0 ? 'Maker name' : 'Another maker'}
                        editable={!disableForm}
                        returnKeyType={index === makers.length - 1 ? 'done' : 'next'}
                        style={styles.makerInput}
                      />
                      <TailTagButton
                        variant="ghost"
                        size="sm"
                        onPress={() => handleRemoveMaker(maker.id)}
                        disabled={disableForm}
                        style={styles.makerRemoveButton}
                      >
                        Remove
                      </TailTagButton>
                    </View>
                  ))}
                </View>
                {makersCanAddMore ? (
                  <TailTagButton
                    variant="outline"
                    size="sm"
                    onPress={handleAddMaker}
                    disabled={disableForm}
                  >
                    Add another maker
                  </TailTagButton>
                ) : (
                  <Text style={styles.helperLabel}>
                    You can add up to {FURSUIT_MAKER_LIMIT} makers.
                  </Text>
                )}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Fursuit Pronouns</Text>
                <Text style={styles.helperLabel}>Select all pronouns that fit your fursuit.</Text>
                <View style={styles.pronounChipList}>
                  {PRONOUN_OPTIONS.map((option) => {
                    const isSelected = selectedPronouns.includes(option);
                    return (
                      <Pressable
                        key={option}
                        accessibilityRole="button"
                        onPress={() => handleTogglePronoun(option)}
                        style={[styles.colorChip, isSelected ? styles.colorChipSelected : null]}
                        disabled={disableForm}
                      >
                        <Text
                          style={[
                            styles.colorChipLabel,
                            isSelected ? styles.colorChipLabelSelected : null,
                          ]}
                        >
                          {option}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Ask me about...</Text>
                <Text style={styles.helperLabel}>
                  Add a few easy conversation starters for people who catch your suit.
                </Text>
                <View style={styles.askMeAboutSuggestionList}>
                  {ASK_ME_ABOUT_SUGGESTIONS.map((suggestion) => (
                    <Pressable
                      key={suggestion}
                      accessibilityRole="button"
                      onPress={() => handleAskMeAboutSuggestion(suggestion)}
                      disabled={disableForm}
                      style={({ pressed }) => [
                        styles.askMeAboutSuggestionChip,
                        pressed ? styles.askMeAboutSuggestionChipPressed : null,
                      ]}
                    >
                      <Text style={styles.askMeAboutSuggestionText}>{suggestion}</Text>
                    </Pressable>
                  ))}
                </View>
                <TailTagInput
                  value={askMeAboutInput}
                  onChangeText={setAskMeAboutInput}
                  placeholder="Give catchers a question to break the ice"
                  editable={!disableForm}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                  style={styles.textArea}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Likes & interests</Text>
                <TailTagInput
                  value={likesInput}
                  onChangeText={setLikesInput}
                  placeholder="Games, hobbies, music, or whatever makes you light up"
                  editable={!disableForm}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  style={styles.textArea}
                />
              </View>

              <View
                style={styles.fieldGroup}
                onLayout={handleInteractionPreferencesLayout}
              >
                <Text style={styles.label}>Interaction preferences</Text>
                <InteractionPreferencesEditor
                  socialSignal={selectedSocialSignal}
                  selectedBadges={selectedInteractionBadges}
                  onSocialSignalChange={setSelectedSocialSignal}
                  onBadgesChange={setSelectedInteractionBadges}
                  disabled={disableForm}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Convention roster</Text>
                <Text style={styles.helperLabel}>
                  List this suit only at conventions you are attending.
                </Text>
                {isConventionsBusy ? (
                  <Text style={styles.message}>Loading conventions…</Text>
                ) : conventionsLoadError ? (
                  <View style={styles.helperColumn}>
                    <Text style={styles.errorText}>{conventionsLoadError}</Text>
                    <TailTagButton
                      variant="outline"
                      size="sm"
                      onPress={() => {
                        void refetchConventions({ throwOnError: false });
                        void refetchProfileConventions({ throwOnError: false });
                      }}
                      disabled={disableForm}
                    >
                      Try again
                    </TailTagButton>
                  </View>
                ) : conventions.length === 0 ? (
                  <Text style={styles.message}>No conventions are open for joining right now.</Text>
                ) : profileConventionIdSet.size === 0 ? (
                  <Text style={styles.message}>
                    Attend a convention in Settings before listing this suit.
                  </Text>
                ) : (
                  <View style={styles.conventionList}>
                    {conventions.map((convention) => {
                      const isAllowed = profileConventionIdSet.has(convention.id);
                      const isSelected = selectedConventionIds.has(convention.id);
                      const rosterSettings =
                        conventionRosterSettingsById[convention.id] ?? DEFAULT_ROSTER_SETTINGS;

                      return (
                        <View
                          key={convention.id}
                          style={styles.conventionRosterItem}
                        >
                          <ConventionToggle
                            convention={convention}
                            selected={isSelected}
                            pending={false}
                            disabled={disableForm || (!isAllowed && !isSelected)}
                            badgeText={
                              isAllowed ? (isSelected ? 'Listed' : 'List suit') : 'Attend first'
                            }
                            onToggle={(conventionId, nextSelected) =>
                              handleConventionToggle(conventionId, nextSelected)
                            }
                          />
                          {isSelected ? (
                            <FursuitConventionRosterControls
                              value={rosterSettings}
                              disabled={disableForm}
                              onChange={(nextValue) =>
                                handleConventionRosterSettingsChange(convention.id, nextValue)
                              }
                            />
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

              <View style={styles.buttonStack}>
                <TailTagButton
                  onPress={handleSubmit}
                  loading={isSubmitting}
                  disabled={isSubmitting || isDeleting}
                >
                  Save changes
                </TailTagButton>
                <TailTagButton
                  variant="ghost"
                  onPress={handleCancel}
                  disabled={isSubmitting || isDeleting}
                >
                  Cancel
                </TailTagButton>
                <TailTagButton
                  variant="destructive"
                  onPress={handleDelete}
                  loading={isDeleting}
                  disabled={isSubmitting || isDeleting}
                >
                  Delete fursuit
                </TailTagButton>
              </View>
            </>
          )}
        </View>
      </KeyboardAwareFormWrapper>
    </View>
  );
}
