import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MenuView } from '@react-native-menu/menu';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';

import * as Linking from 'expo-linking';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { AppAvatar } from '../../src/components/ui/AppAvatar';
import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { TailTagInput } from '../../src/components/ui/TailTagInput';
import { KeyboardAwareFormWrapper } from '../../src/components/ui/KeyboardAwareFormWrapper';
import { STAFF_MODE_ENABLED } from '../../src/constants/features';
import {
  ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY,
  CONVENTIONS_STALE_TIME,
  fetchJoinableConventions,
  fetchPastConventionRecaps,
  fetchProfileConventionMemberships,
  formatConventionDateRange,
  JOINABLE_CONVENTIONS_QUERY_KEY,
  optInToConvention,
  optOutOfConvention,
  PAST_CONVENTION_RECAPS_QUERY_KEY,
  parsePastConventionRecapSummary,
  PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY,
  useConventionVerificationAction,
} from '../../src/features/conventions';
import { useAuth } from '../../src/features/auth';
import {
  readProfileGuidanceFlag,
  usernameReviewedStorageKey,
  writeProfileGuidanceFlag,
} from '../../src/features/profile-guidance';
import type {
  ConventionSummary,
  ConventionMembership,
  ConventionMembershipState,
  PastConventionRecap,
  VerifiedLocation,
} from '../../src/features/conventions';
import { ConventionToggle } from '../../src/components/conventions/ConventionToggle';
import { supabase } from '../../src/lib/supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../src/lib/runtimeConfig';
import { captureHandledException } from '../../src/lib/sentry';
import { colors } from '../../src/theme';
import { buildImageUploadCandidate, extractStoragePath } from '../../src/utils/images';
import { buildAuthenticatedStorageObjectUrl } from '../../src/utils/supabase-image';
import { PROFILE_AVATAR_BUCKET } from '../../src/constants/storage';
import { emitGameplayEvent } from '../../src/features/events';
import { DAILY_TASKS_QUERY_KEY } from '../../src/features/daily-tasks/hooks';
import {
  checkUsernameAvailability,
  fetchProfile,
  hasUploadedProfileAvatar,
  normalizeUsernameInput,
  USERNAME_MAX_LENGTH,
  uploadProfileAvatar,
  updateProfileCatchMode,
  updateProfileAvatar,
  updateProfileSocialLinks,
  validateUsername,
  PROFILE_QUERY_KEY,
  PROFILE_STALE_TIME,
} from '../../src/features/profile';
import type { CatchMode, ProfileSummary } from '../../src/features/profile';
import { CatchModeSwitch } from '../../src/features/catch-confirmations';
import type { FursuitPhotoCandidate } from '../../src/features/onboarding/api/onboarding';
import type { EditableSocialLink } from '../../src/features/suits/forms/socialLinks';
import {
  ALLOWED_SOCIAL_PLATFORMS,
  CUSTOM_PLATFORM_ID,
  SOCIAL_LINK_LIMIT,
  createEmptySocialLink,
  mapEditableSocialLinks,
  socialLinksToSave,
} from '../../src/features/suits/forms/socialLinks';
import { canUseStaffMode } from '../../src/features/staff-mode/constants';
import {
  createCurrentUserHasPasswordCredentialQueryOptions,
  inferPasswordCredentialFromSession,
} from '../../src/features/auth/utils/passwordCredential';
import {
  CAUGHT_SUITS_QUERY_KEY,
  CAUGHT_SUITS_STALE_TIME,
  caughtSuitsQueryKey,
  fetchCaughtSuits,
} from '../../src/features/suits/api/caughtSuits';
import type { CaughtRecord } from '../../src/features/suits/api/caughtSuits';
import { CONVENTION_LEADERBOARD_QUERY_KEY } from '../../src/features/leaderboard/api/leaderboard';
import { usePushNotifications } from '../../src/features/push-notifications';
import { useOtaUpdateCheck } from '../../src/hooks/useOtaUpdateCheck';
import { styles } from '../../src/app-styles/(tabs)/settings.styles';

const FEEDBACK_FORM_URL = 'https://forms.gle/e65DqKt1VsuvoFTx8';
const PRIVACY_POLICY_URL = 'https://playtailtag.com/privacy';
const TERMS_URL = 'https://playtailtag.com/terms';
const DELETE_ACCOUNT_URL = 'https://playtailtag.com/delete-account';
const SUPPORT_EMAIL_URL = 'mailto:finn@finnthepanther.com';
const SAVE_PROFILE_FEEDBACK_DURATION_MS = 2200;

function conventionBadgeText(
  convention: ConventionSummary,
  selected: boolean,
  membershipState?: ConventionMembershipState | null,
) {
  if (!selected) {
    return convention.is_joinable ? 'Tap to join' : 'Add to yours';
  }

  if (membershipState === 'active') {
    return 'Ready to catch';
  }

  if (membershipState === 'needs_location_verification') {
    return 'Verify location';
  }

  if (membershipState === 'awaiting_start') {
    return 'Waiting for staff start';
  }

  if (membershipState === 'upcoming') {
    const startsAt = formatConventionDateRange(convention.start_date ?? null, null);
    return startsAt ? `Starts ${startsAt}` : 'Joined';
  }

  return 'Joined';
}

export default function SettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ focus?: string }>();
  const { isUpdateReady, isRestarting, restartError, restartToApplyUpdate } = useOtaUpdateCheck();
  const { session, forceSignOut } = useAuth();
  const userId = session?.user.id ?? null;
  const accountEmail = session?.user?.email?.trim() ?? '';
  const hasEmailAddress = accountEmail.length > 0;
  const fallbackHasPasswordCredential = inferPasswordCredentialFromSession(session?.user);
  const { data: hasPasswordCredentialFromServer = null } = useQuery<boolean | null, Error>(
    createCurrentUserHasPasswordCredentialQueryOptions(userId),
  );
  const hasPasswordCredential = hasPasswordCredentialFromServer ?? fallbackHasPasswordCredential;
  const passwordActionLabel = hasPasswordCredential ? 'Change password' : 'Set password';

  const queryClient = useQueryClient();
  const profileQueryKey = useMemo(() => [PROFILE_QUERY_KEY, userId] as const, [userId]);
  const {
    data: profile = null,
    error: profileError,
    isLoading: isProfileLoading,
    refetch: refetchProfile,
  } = useQuery<ProfileSummary | null, Error>({
    queryKey: profileQueryKey,
    enabled: Boolean(userId),
    staleTime: PROFILE_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchProfile(userId!),
  });

  const conventionsQueryKey = useMemo(() => [JOINABLE_CONVENTIONS_QUERY_KEY] as const, []);
  const profileConventionMembershipsQueryKey = useMemo(
    () => [PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY, userId] as const,
    [userId],
  );
  const pastConventionRecapsQueryKey = useMemo(
    () => [PAST_CONVENTION_RECAPS_QUERY_KEY, userId] as const,
    [userId],
  );
  const {
    data: conventions = [],
    error: conventionsError,
    isLoading: isConventionsLoading,
    refetch: refetchConventions,
  } = useQuery<ConventionSummary[], Error>({
    queryKey: conventionsQueryKey,
    enabled: Boolean(userId),
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchJoinableConventions(),
  });

  const {
    data: profileConventionMemberships = [],
    error: profileConventionsError,
    isLoading: isProfileConventionsLoading,
    refetch: refetchProfileConventions,
  } = useQuery<ConventionMembership[], Error>({
    queryKey: profileConventionMembershipsQueryKey,
    enabled: Boolean(userId),
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: fetchProfileConventionMemberships,
  });
  const { verifyConvention, verificationModals, isVerifyingConvention } =
    useConventionVerificationAction({
      profileId: userId,
      onVerified: async () => {
        await refetchProfileConventions({ throwOnError: false });
      },
    });

  const {
    data: pastConventionRecaps = [],
    error: pastConventionRecapsError,
    isLoading: isPastConventionRecapsLoading,
    refetch: refetchPastConventionRecaps,
  } = useQuery<PastConventionRecap[], Error>({
    queryKey: pastConventionRecapsQueryKey,
    enabled: Boolean(userId),
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchPastConventionRecaps(),
  });

  const caughtSuitsQueryKeyValue = useMemo(
    () => (userId ? caughtSuitsQueryKey(userId) : ([CAUGHT_SUITS_QUERY_KEY] as const)),
    [userId],
  );
  const {
    data: caughtSuits = [],
    error: caughtSuitsError,
    isLoading: isCaughtSuitsLoading,
    refetch: refetchCaughtSuits,
  } = useQuery<CaughtRecord[], Error>({
    queryKey: caughtSuitsQueryKeyValue,
    enabled: Boolean(userId),
    staleTime: CAUGHT_SUITS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchCaughtSuits(userId!),
  });

  const {
    isSupported: isPushSupported,
    permissionStatus,
    isEnabled: isPushEnabled,
    isRegistering: isPushRegistering,
    error: pushError,
    requestPermissionAndRegister,
    disablePushNotifications,
    refreshState: refreshPushState,
  } = usePushNotifications({ userId });

  const [usernameInput, setUsernameInput] = useState('');
  const [bioInput, setBioInput] = useState('');

  type UsernameCheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';
  const [usernameCheckStatus, setUsernameCheckStatus] = useState<UsernameCheckStatus>('idle');
  const usernameCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [optimisticPushEnabled, setOptimisticPushEnabled] = useState<boolean | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [socialLinks, setSocialLinks] = useState<EditableSocialLink[]>(() => [
    createEmptySocialLink(),
  ]);
  const [isSavingSocialLinks, setIsSavingSocialLinks] = useState(false);
  const [socialLinksError, setSocialLinksError] = useState<string | null>(null);
  const [socialLinksMessage, setSocialLinksMessage] = useState<string | null>(null);
  const [isSavingCatchMode, setIsSavingCatchMode] = useState(false);
  const [catchModeError, setCatchModeError] = useState<string | null>(null);
  const [catchModeMessage, setCatchModeMessage] = useState<string | null>(null);
  const [hasHydratedSocialLinks, setHasHydratedSocialLinks] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [hasReviewedUsername, setHasReviewedUsername] = useState<boolean | null>(null);
  const [hasEditedDraft, setHasEditedDraft] = useState(false);
  const saveMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const isDeletingAccountRef = useRef(false);
  const [conventionError, setConventionError] = useState<string | null>(null);
  const [pendingMemberships, setPendingMemberships] = useState<Set<string>>(() => new Set());

  const selectedConventionIdSet = useMemo(
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

  const normalizedUsernameInput = useMemo(
    () => normalizeUsernameInput(usernameInput),
    [usernameInput],
  );
  const normalizedSessionUsername = useMemo(() => {
    const metadataUsername = session?.user.user_metadata?.username;
    return typeof metadataUsername === 'string' ? normalizeUsernameInput(metadataUsername) : '';
  }, [session?.user.user_metadata?.username]);
  const normalizedProfileUsername = useMemo(
    () => normalizeUsernameInput(profile?.username ?? ''),
    [profile?.username],
  );
  const normalizedCurrentUsername = useMemo(
    () =>
      normalizedProfileUsername.length > 0 ? normalizedProfileUsername : normalizedSessionUsername,
    [normalizedProfileUsername, normalizedSessionUsername],
  );
  const usernameValidation = useMemo(
    () => validateUsername(normalizedUsernameInput, { allowEmpty: true }),
    [normalizedUsernameInput],
  );
  const hasUsernameValidationError =
    normalizedUsernameInput.length > 0 && !usernameValidation.isValid;
  const usernameValidationMessage = hasUsernameValidationError ? usernameValidation.message : null;

  const isDirty = useMemo(() => {
    const usernameChanged = normalizedCurrentUsername !== normalizedUsernameInput;
    const bioChanged = (profile?.bio ?? '') !== bioInput.trim();
    return usernameChanged || bioChanged;
  }, [bioInput, normalizedCurrentUsername, normalizedUsernameInput, profile?.bio]);

  const resetDraftFromProfile = useCallback(
    (summary: ProfileSummary | null, options: { resetMessages?: boolean } = {}) => {
      const { resetMessages = true } = options;

      const summaryUsername = normalizeUsernameInput(summary?.username ?? '');
      setUsernameInput(summaryUsername || normalizedSessionUsername);
      setBioInput(summary?.bio ?? '');

      if (resetMessages) {
        setSaveMessage(null);
        setSaveError(null);
      }
    },
    [normalizedSessionUsername],
  );

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        resetDraftFromProfile(null);
        return;
      }

      if (!hasEditedDraft) {
        resetDraftFromProfile(profile, { resetMessages: true });
      }
      const profileState = queryClient.getQueryState<ProfileSummary | null>(profileQueryKey);

      if (
        !profileState ||
        profileState.isInvalidated ||
        (profileState.status === 'success' &&
          Date.now() - profileState.dataUpdatedAt > PROFILE_STALE_TIME)
      ) {
        void refetchProfile({ throwOnError: false });
      }

      const conventionsState = queryClient.getQueryState<ConventionSummary[]>(conventionsQueryKey);

      if (
        !conventionsState ||
        conventionsState.isInvalidated ||
        (conventionsState.status === 'success' &&
          Date.now() - conventionsState.dataUpdatedAt > CONVENTIONS_STALE_TIME)
      ) {
        void refetchConventions({ throwOnError: false });
      }

      const profileConventionsState = queryClient.getQueryState<ConventionMembership[]>(
        profileConventionMembershipsQueryKey,
      );

      if (
        !profileConventionsState ||
        profileConventionsState.isInvalidated ||
        (profileConventionsState.status === 'success' &&
          Date.now() - profileConventionsState.dataUpdatedAt > CONVENTIONS_STALE_TIME)
      ) {
        void refetchProfileConventions({ throwOnError: false });
      }

      const pastConventionRecapsState = queryClient.getQueryState<PastConventionRecap[]>(
        pastConventionRecapsQueryKey,
      );

      if (
        !pastConventionRecapsState ||
        pastConventionRecapsState.isInvalidated ||
        (pastConventionRecapsState.status === 'success' &&
          Date.now() - pastConventionRecapsState.dataUpdatedAt > CONVENTIONS_STALE_TIME)
      ) {
        void refetchPastConventionRecaps({ throwOnError: false });
      }

      const caughtSuitsState = queryClient.getQueryState<CaughtRecord[]>(caughtSuitsQueryKeyValue);

      if (
        !caughtSuitsState ||
        caughtSuitsState.isInvalidated ||
        (caughtSuitsState.status === 'success' &&
          Date.now() - caughtSuitsState.dataUpdatedAt > CAUGHT_SUITS_STALE_TIME)
      ) {
        void refetchCaughtSuits({ throwOnError: false });
      }

      void refreshPushState();
    }, [
      hasEditedDraft,
      profile,
      profileQueryKey,
      queryClient,
      refetchProfile,
      resetDraftFromProfile,
      userId,
      conventionsQueryKey,
      refetchConventions,
      profileConventionMembershipsQueryKey,
      refetchProfileConventions,
      pastConventionRecapsQueryKey,
      refetchPastConventionRecaps,
      caughtSuitsQueryKeyValue,
      refetchCaughtSuits,
      refreshPushState,
    ]),
  );

  useEffect(() => {
    if (!userId) {
      setHasReviewedUsername(null);
      resetDraftFromProfile(null);
      setHasEditedDraft(false);
      return;
    }

    if (hasEditedDraft || isSaving) {
      return;
    }

    resetDraftFromProfile(profile, { resetMessages: false });
  }, [hasEditedDraft, isSaving, profile, resetDraftFromProfile, userId]);

  useEffect(() => {
    let isActive = true;

    if (!userId) {
      setHasReviewedUsername(null);
      return () => {
        isActive = false;
      };
    }

    readProfileGuidanceFlag(usernameReviewedStorageKey(userId))
      .then((value) => {
        if (isActive) {
          setHasReviewedUsername(value ?? false);
        }
      })
      .catch(() => {
        if (isActive) {
          setHasReviewedUsername(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!isDirty && hasEditedDraft) {
      setHasEditedDraft(false);
    }
  }, [hasEditedDraft, isDirty]);

  // Hydrate social links from profile once on first load
  useEffect(() => {
    if (hasHydratedSocialLinks || !profile) return;
    const existing = profile.social_links ?? [];
    setSocialLinks(mapEditableSocialLinks(existing));
    setHasHydratedSocialLinks(true);
  }, [profile, hasHydratedSocialLinks]);

  useEffect(() => {
    if (!userId) {
      setConventionError(null);
      setPendingMemberships(() => new Set());
      setDeleteAccountError(null);
      setIsDeletingAccount(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!saveMessage) {
      return;
    }

    if (saveMessageTimeoutRef.current) {
      clearTimeout(saveMessageTimeoutRef.current);
    }

    saveMessageTimeoutRef.current = setTimeout(() => {
      setSaveMessage(null);
      saveMessageTimeoutRef.current = null;
    }, SAVE_PROFILE_FEEDBACK_DURATION_MS);

    return () => {
      if (saveMessageTimeoutRef.current) {
        clearTimeout(saveMessageTimeoutRef.current);
        saveMessageTimeoutRef.current = null;
      }
    };
  }, [saveMessage]);

  useEffect(() => {
    if (usernameCheckRef.current) {
      clearTimeout(usernameCheckRef.current);
    }

    // No check needed if empty or unchanged from saved profile
    if (
      !normalizedUsernameInput ||
      normalizedUsernameInput === normalizedCurrentUsername ||
      !usernameValidation.isValid
    ) {
      setUsernameCheckStatus('idle');
      return;
    }

    setUsernameCheckStatus('checking');

    usernameCheckRef.current = setTimeout(() => {
      if (!userId) return;
      checkUsernameAvailability(normalizedUsernameInput, userId)
        .then((available) => {
          setUsernameCheckStatus(available ? 'available' : 'taken');
        })
        .catch(() => {
          setUsernameCheckStatus('error');
        });
    }, 500);

    return () => {
      if (usernameCheckRef.current) {
        clearTimeout(usernameCheckRef.current);
      }
    };
  }, [normalizedCurrentUsername, normalizedUsernameInput, userId, usernameValidation.isValid]);

  const conventionsLoadError =
    conventionsError?.message ?? profileConventionsError?.message ?? null;
  const isConventionsBusy = isConventionsLoading || isProfileConventionsLoading;

  const statsError =
    caughtSuitsError?.message ??
    profileConventionsError?.message ??
    pastConventionRecapsError?.message ??
    null;
  const isStatsLoading =
    isCaughtSuitsLoading || isProfileConventionsLoading || isPastConventionRecapsLoading;
  const caughtSuitCount = caughtSuits.length;
  const attendedConventionCount = useMemo(() => {
    const conventionIds = new Set(
      profileConventionMemberships
        .filter(
          (membership) =>
            membership.membership_state === 'active' || membership.membership_state === 'past',
        )
        .map((membership) => membership.convention_id),
    );
    pastConventionRecaps.forEach((recap) => conventionIds.add(recap.conventionId));
    return conventionIds.size;
  }, [pastConventionRecaps, profileConventionMemberships]);
  const staffModeAllowed = useMemo(
    () => STAFF_MODE_ENABLED && canUseStaffMode(profile?.role ?? null),
    [profile?.role],
  );
  const isPushDenied = permissionStatus === 'denied';
  const canTogglePush = isPushSupported && !isPushRegistering;
  const isPushToggleOn = isPushSupported && permissionStatus === 'granted' && isPushEnabled;
  const displayPushToggleOn = optimisticPushEnabled ?? isPushToggleOn;
  const showUsernameGuidance =
    params.focus === 'username' &&
    hasReviewedUsername === false &&
    normalizedCurrentUsername.length > 0 &&
    validateUsername(normalizedCurrentUsername).isValid;
  const canKeepCurrentUsername =
    showUsernameGuidance &&
    !isDirty &&
    !isSaving &&
    !isProfileLoading &&
    usernameCheckStatus !== 'checking';

  const handleTogglePush = useCallback(
    async (nextValue: boolean) => {
      // Optimistically reflect the tap immediately so the switch animates smoothly.
      setOptimisticPushEnabled(nextValue);

      try {
        if (nextValue) {
          if (isPushDenied) {
            // Attempt re-request — works on Android if not permanently denied;
            // on iOS returns denied immediately without showing a dialog.
            const success = await requestPermissionAndRegister();
            if (!success) {
              Alert.alert(
                'Notifications Blocked',
                'Notifications for TailTag are disabled. To enable them, open your device settings and allow notifications for TailTag.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Open Settings',
                    onPress: () => void Linking.openSettings(),
                  },
                ],
              );
            }
            return;
          }
          await requestPermissionAndRegister();
          return;
        }

        await disablePushNotifications();
      } finally {
        // Clear optimistic state — real state from the hook now reflects truth.
        setOptimisticPushEnabled(null);
      }
    },
    [disablePushNotifications, isPushDenied, requestPermissionAndRegister],
  );

  const handleOpenFeedbackForm = useCallback(async () => {
    await WebBrowser.openBrowserAsync(FEEDBACK_FORM_URL);
  }, []);

  const handleOpenExternalUrl = useCallback(async (url: string) => {
    if (url.startsWith('mailto:')) {
      await Linking.openURL(url);
      return;
    }

    await WebBrowser.openBrowserAsync(url);
  }, []);

  const markUsernameReviewed = useCallback(async () => {
    if (!userId) {
      return;
    }

    setHasReviewedUsername(true);
    await writeProfileGuidanceFlag(usernameReviewedStorageKey(userId)).catch(() => undefined);
  }, [userId]);

  const handleOpenConventionRecap = useCallback(
    (recapId: string) => {
      router.push({
        pathname: '/convention-recaps/[recapId]',
        params: { recapId },
      });
    },
    [router],
  );

  const isUsernameTaken = usernameCheckStatus === 'taken';
  const isUsernameChecking = usernameCheckStatus === 'checking';

  const handleSave = useCallback(async () => {
    if (!userId || isSaving || !isDirty) {
      return;
    }

    Keyboard.dismiss();

    const trimmedUsername = normalizedUsernameInput;
    const trimmedBio = bioInput.trim();
    const normalizedUsername = trimmedUsername.length > 0 ? trimmedUsername : null;
    const normalizedBio = trimmedBio.length > 0 ? trimmedBio : null;

    if (normalizedUsername) {
      const validation = validateUsername(normalizedUsername);
      if (!validation.isValid) {
        setSaveError(validation.message ?? 'Please enter a valid username.');
        return;
      }
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const { error } = await (supabase as any).from('profiles').upsert(
        {
          id: userId,
          username: normalizedUsername,
          bio: normalizedBio,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );

      if (error) {
        throw error;
      }

      queryClient.setQueryData<ProfileSummary | null>(profileQueryKey, (current) =>
        current
          ? {
              ...current,
              username: normalizedUsername,
              bio: normalizedBio,
            }
          : {
              username: normalizedUsername,
              bio: normalizedBio,
              avatar_path: null,
              avatar_url: null,
              social_links: [],
              default_catch_mode: 'AUTO_ACCEPT',
              catch_mode_preference_source: 'system_default',
              is_new: false,
              onboarding_completed: false,
            },
      );
      setUsernameInput(trimmedUsername);
      setBioInput(trimmedBio);
      setHasEditedDraft(false);
      setSaveMessage('Profile saved');

      if (normalizedUsername && validateUsername(normalizedUsername).isValid) {
        void markUsernameReviewed();
      }

      // Fire-and-forget: don't block UI on event emission
      void emitGameplayEvent({
        type: 'profile_updated',
        payload: {
          username_present: trimmedUsername.length > 0,
          bio_present: trimmedBio.length > 0,
          avatar_present: hasUploadedProfileAvatar(profile?.avatar_url, profile?.avatar_path),
        },
      }).catch((error) => {
        captureHandledException(error, {
          scope: 'settings.handleSave.profileUpdated',
          userId,
        });
      });
      void queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : 'We could not update your profile right now. Please try again.';
      setSaveError(fallbackMessage);
    } finally {
      setIsSaving(false);
    }
  }, [
    userId,
    isSaving,
    isDirty,
    normalizedUsernameInput,
    bioInput,
    profile?.avatar_path,
    profile?.avatar_url,
    profileQueryKey,
    queryClient,
    markUsernameReviewed,
  ]);

  const handlePickAvatar = useCallback(async () => {
    if (!userId || isUploadingAvatar) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const photo: FursuitPhotoCandidate = buildImageUploadCandidate(asset, `avatar-${Date.now()}`);

    setIsUploadingAvatar(true);
    setAvatarError(null);

    try {
      const oldAvatarUrl =
        queryClient.getQueryData<ProfileSummary | null>(profileQueryKey)?.avatar_url ?? null;
      const oldAvatarPath =
        queryClient.getQueryData<ProfileSummary | null>(profileQueryKey)?.avatar_path ?? null;
      const avatarPath = await uploadProfileAvatar(userId, photo);
      await updateProfileAvatar(userId, avatarPath);
      const avatarUrl = buildAuthenticatedStorageObjectUrl(PROFILE_AVATAR_BUCKET, avatarPath);
      queryClient.setQueryData<ProfileSummary | null>(profileQueryKey, (current) =>
        current
          ? {
              ...current,
              avatar_path: avatarPath,
              avatar_url: avatarUrl,
            }
          : current,
      );
      void emitGameplayEvent({
        type: 'profile_updated',
        payload: {
          username_present: Boolean(profile?.username?.trim()),
          bio_present: Boolean(profile?.bio?.trim()),
          avatar_present: true,
        },
      }).catch((error) => {
        captureHandledException(error, {
          scope: 'settings.handlePickAvatar.profileUpdated',
          userId,
        });
      });
      const oldPath = oldAvatarPath ?? extractStoragePath(oldAvatarUrl, PROFILE_AVATAR_BUCKET);
      if (oldPath) {
        void supabase.storage
          .from(PROFILE_AVATAR_BUCKET)
          .remove([oldPath])
          .catch(() => {});
      }
    } catch (caught) {
      const msg =
        caught instanceof Error
          ? caught.message
          : "We couldn't upload your photo. Please try again.";
      setAvatarError(msg);
    } finally {
      setIsUploadingAvatar(false);
    }
  }, [userId, isUploadingAvatar, profile?.bio, profile?.username, profileQueryKey, queryClient]);

  const handleCatchModeChange = useCallback(
    async (nextCatchMode: CatchMode) => {
      if (!userId || isSavingCatchMode) {
        return;
      }

      const previousCatchMode = profile?.default_catch_mode ?? 'AUTO_ACCEPT';
      const previousPreferenceSource = profile?.catch_mode_preference_source ?? 'system_default';
      if (previousCatchMode === nextCatchMode) {
        return;
      }

      setIsSavingCatchMode(true);
      setCatchModeError(null);
      setCatchModeMessage(null);

      try {
        await updateProfileCatchMode(userId, nextCatchMode);

        queryClient.setQueryData<ProfileSummary | null>(profileQueryKey, (current) =>
          current
            ? {
                ...current,
                default_catch_mode: nextCatchMode,
                catch_mode_preference_source: 'user_selected',
              }
            : current,
        );

        setCatchModeMessage('Catch settings saved');

        void emitGameplayEvent({
          type: 'profile_catch_mode_changed',
          payload: {
            previous_catch_mode: previousCatchMode,
            new_catch_mode: nextCatchMode,
            previous_preference_source: profile?.catch_mode_preference_source ?? 'system_default',
            preference_source: 'user_selected',
            source: 'settings',
          },
          idempotencyKey: `profile-catch-mode:${userId}:${Date.now()}`,
        }).catch((error) => {
          captureHandledException(error, {
            scope: 'settings.handleCatchModeChange.event',
            userId,
          });
        });
      } catch (caught) {
        setCatchModeError(
          caught instanceof Error ? caught.message : 'Could not save catch settings. Try again.',
        );
        queryClient.setQueryData<ProfileSummary | null>(profileQueryKey, (current) =>
          current
            ? {
                ...current,
                default_catch_mode: previousCatchMode,
                catch_mode_preference_source: previousPreferenceSource,
              }
            : current,
        );
      } finally {
        setIsSavingCatchMode(false);
      }
    },
    [
      userId,
      isSavingCatchMode,
      profile?.default_catch_mode,
      profile?.catch_mode_preference_source,
      profileQueryKey,
      queryClient,
    ],
  );

  const socialLinksCanAddMore = socialLinks.length < SOCIAL_LINK_LIMIT;

  const handleSocialLinkChange = (
    id: string,
    field: 'platformId' | 'handle' | 'label' | 'url',
    value: string,
  ) => {
    setSocialLinks((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)),
    );
  };

  const handleAddSocialLink = () => {
    if (!socialLinksCanAddMore) return;
    setSocialLinks((current) => [...current, createEmptySocialLink()]);
  };

  const handleRemoveSocialLink = (id: string) => {
    setSocialLinks((current) => {
      const next = current.filter((entry) => entry.id !== id);
      return next.length > 0 ? next : [createEmptySocialLink()];
    });
  };

  const handleSaveSocialLinks = useCallback(async () => {
    if (!userId || isSavingSocialLinks) return;

    Keyboard.dismiss();

    const normalized = socialLinksToSave(socialLinks);

    setIsSavingSocialLinks(true);
    setSocialLinksError(null);
    setSocialLinksMessage(null);

    try {
      await updateProfileSocialLinks(userId, normalized);
      queryClient.setQueryData<ProfileSummary | null>(profileQueryKey, (current) =>
        current ? { ...current, social_links: normalized } : current,
      );
      setSocialLinksMessage('Social links saved');
    } catch (caught) {
      setSocialLinksError(
        caught instanceof Error ? caught.message : 'Could not save social links. Try again.',
      );
    } finally {
      setIsSavingSocialLinks(false);
    }
  }, [userId, isSavingSocialLinks, socialLinks, profileQueryKey, queryClient]);

  const handleToggleProfileConvention = useCallback(
    async (
      conventionId: string,
      nextSelected: boolean,
      verifiedLocation?: VerifiedLocation | null,
    ) => {
      if (!userId) {
        return;
      }

      const key = `profile:${userId}:${conventionId}`;

      if (pendingMemberships.has(key)) {
        return;
      }

      setConventionError(null);
      setPendingMemberships((current) => {
        const next = new Set(current);
        next.add(key);
        return next;
      });

      try {
        const previouslySelectedConventionIds = [...selectedConventionIdSet].filter(
          (id) => id !== conventionId,
        );

        if (!nextSelected) {
          await optOutOfConvention(userId, conventionId);
        } else {
          await optInToConvention({
            profileId: userId,
            conventionId,
            verifiedLocation: verifiedLocation ?? undefined,
            verificationMethod: verifiedLocation ? 'gps' : 'none',
          });
        }

        await Promise.all([
          refetchProfileConventions({ throwOnError: false }),
          queryClient.invalidateQueries({
            queryKey: [ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY, userId],
          }),
          queryClient.invalidateQueries({
            queryKey: [DAILY_TASKS_QUERY_KEY],
          }),
          queryClient.invalidateQueries({
            queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, conventionId],
          }),
          ...previouslySelectedConventionIds.map((id) =>
            queryClient.invalidateQueries({
              queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, id],
            }),
          ),
        ]);
      } catch (caught) {
        const fallbackMessage =
          caught instanceof Error
            ? caught.message
            : 'We could not update your conventions right now. Please try again.';
        setConventionError(fallbackMessage);
      } finally {
        setPendingMemberships((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [pendingMemberships, queryClient, refetchProfileConventions, selectedConventionIdSet, userId],
  );

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setSignOutError(null);

    const { error } = await supabase.auth.signOut();

    if (error) {
      setSignOutError(error.message);
      setIsSigningOut(false);
    }
  }, [isSigningOut]);

  const performAccountDeletion = useCallback(async () => {
    if (!userId || isDeletingAccount || isDeletingAccountRef.current) {
      return;
    }

    isDeletingAccountRef.current = true;
    setIsDeletingAccount(true);
    setDeleteAccountError(null);

    try {
      // Get token
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      const accessToken = currentSession?.access_token;

      if (!accessToken) {
        throw new Error('No session found');
      }

      const supabaseUrl = SUPABASE_URL;
      const supabaseKey = SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing config');
      }

      // Call Edge Function
      const response = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseKey,
        },
      });

      if (!response.ok) {
        let errorMessage = 'Deletion failed';
        try {
          const payload = (await response.json()) as { error?: string };
          if (typeof payload.error === 'string' && payload.error.length > 0) {
            errorMessage = payload.error;
          }
        } catch {
          // Ignore parse failures and keep the generic message.
        }
        throw new Error(errorMessage);
      }

      // Clear local session and cache
      await forceSignOut();
      queryClient.clear();

      // Stay on this screen - user will be redirected by auth guard
      Alert.alert('Account Deleted', 'Your account has been permanently deleted.');
    } catch (caught) {
      setDeleteAccountError(caught instanceof Error ? caught.message : 'Deletion failed');
    } finally {
      setIsDeletingAccount(false);
      isDeletingAccountRef.current = false;
    }
  }, [forceSignOut, isDeletingAccount, queryClient, userId]);

  const handleDeleteAccount = useCallback(() => {
    if (!userId || isDeletingAccount) {
      return;
    }

    Alert.alert(
      'Delete account?',
      "Deleting your account will permanently remove your profile, fursuits, catches, achievements, and daily task progress. This can't be undone.",
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => {
            void performAccountDeletion();
          },
        },
      ],
    );
  }, [isDeletingAccount, performAccountDeletion, userId]);

  return (
    <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Settings</Text>
          <Text style={styles.title}>Profile & account</Text>
          <Text style={styles.subtitle}>
            Update your settings, sign out, or delete your account.
          </Text>
        </View>
        <MenuView
          title="More options"
          onPressAction={({ nativeEvent }) => {
            if (nativeEvent.event === 'blocked-users') {
              router.push('/blocked-users');
            }
          }}
          actions={[
            {
              id: 'blocked-users',
              title: 'Blocked users',
              image: 'hand.raised',
            },
          ]}
        >
          <Pressable
            style={styles.menuButton}
            hitSlop={8}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        </MenuView>
      </View>

      {isUpdateReady ? (
        <View style={styles.updateNotice}>
          <View style={styles.updateNoticeHeader}>
            <View style={styles.updateNoticeIcon}>
              <Ionicons
                name="cloud-download-outline"
                size={18}
                color={colors.primary}
              />
            </View>
            <View style={styles.updateNoticeText}>
              <Text style={styles.updateNoticeTitle}>Update ready</Text>
              <Text style={styles.updateNoticeBody}>
                Restart TailTag to apply the latest update.
              </Text>
            </View>
          </View>

          <TailTagButton
            onPress={() => void restartToApplyUpdate()}
            loading={isRestarting}
            disabled={isRestarting}
            accessibilityLabel="Restart TailTag"
            accessibilityHint="Restarts the app to apply the latest update."
          >
            Restart TailTag
          </TailTagButton>

          {restartError ? <Text style={styles.updateNoticeError}>{restartError}</Text> : null}
        </View>
      ) : null}

      <TailTagCard>
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Your all-time stats</Text>
          {isStatsLoading ? (
            <Text style={styles.message}>Loading stats…</Text>
          ) : statsError ? (
            <View style={styles.helperColumn}>
              <Text style={styles.error}>{statsError}</Text>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={() => {
                  void refetchCaughtSuits({ throwOnError: false });
                  void refetchProfileConventions({ throwOnError: false });
                  void refetchPastConventionRecaps({ throwOnError: false });
                }}
              >
                Try again
              </TailTagButton>
            </View>
          ) : (
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{caughtSuitCount.toLocaleString()}</Text>
                <Text style={styles.statLabel}>Fursuits caught</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{attendedConventionCount.toLocaleString()}</Text>
                <Text style={styles.statLabel}>Conventions attended</Text>
              </View>
            </View>
          )}
        </View>
      </TailTagCard>

      {pastConventionRecaps.length > 0 ? (
        <TailTagCard>
          <View style={styles.conventionSection}>
            <Text style={styles.sectionTitle}>Past conventions</Text>
            <Text style={styles.sectionDescription}>
              Recaps from events you joined after they have been archived.
            </Text>
            <View style={styles.pastConventionList}>
              {pastConventionRecaps.map((recap) => {
                const summary = parsePastConventionRecapSummary(recap.summary);
                const fallbackUniqueFursuitsCaughtCount =
                  recap.uniqueFursuitsCaughtCount > 0
                    ? recap.uniqueFursuitsCaughtCount
                    : summary.fursuitsCaught.length;
                const fallbackOwnFursuitsCaughtCount =
                  recap.ownFursuitsCaughtCount > 0
                    ? recap.ownFursuitsCaughtCount
                    : summary.ownFursuits.reduce(
                        (total, fursuit) => total + fursuit.timesCaught,
                        0,
                      );
                const fallbackAchievementsUnlockedCount =
                  recap.achievementsUnlockedCount > 0
                    ? recap.achievementsUnlockedCount
                    : summary.achievementIds.length;
                const fallbackDailyTasksCompletedCount =
                  recap.dailyTasksCompletedCount > 0 ? recap.dailyTasksCompletedCount : 0;

                return (
                  <Pressable
                    key={recap.recapId}
                    accessibilityRole="button"
                    accessibilityLabel={`View recap for ${recap.conventionName}`}
                    accessibilityHint="Opens convention recap details"
                    onPress={() => handleOpenConventionRecap(recap.recapId)}
                    style={({ pressed }) => [
                      styles.pastConventionCard,
                      pressed && styles.pastConventionCardPressed,
                    ]}
                  >
                    <View style={styles.pastConventionHeader}>
                      <View style={styles.pastConventionTitleBlock}>
                        <Text style={styles.pastConventionName}>{recap.conventionName}</Text>
                        <Text style={styles.pastConventionMeta}>{formatRecapDateRange(recap)}</Text>
                      </View>
                      {recap.finalRank ? (
                        <View style={styles.rankBadge}>
                          <Text style={styles.rankBadgeText}>#{recap.finalRank}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.recapStatsGrid}>
                      <RecapStat
                        label="Catches"
                        value={recap.catchCount}
                      />
                      <RecapStat
                        label="Fursuits found"
                        value={fallbackUniqueFursuitsCaughtCount}
                      />
                      <RecapStat
                        label="Your suits caught"
                        value={fallbackOwnFursuitsCaughtCount}
                      />
                      <RecapStat
                        label="Achievements"
                        value={fallbackAchievementsUnlockedCount}
                      />
                      <RecapStat
                        label="Daily tasks"
                        value={fallbackDailyTasksCompletedCount}
                      />
                    </View>
                    <View style={styles.recapCtaRow}>
                      <Text style={styles.recapCtaText}>View recap</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={colors.primary}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </TailTagCard>
      ) : null}

      <TailTagCard>
        {isProfileLoading ? (
          <Text style={styles.message}>Loading profile…</Text>
        ) : profileError ? (
          <Text style={styles.error}>{profileError.message}</Text>
        ) : (
          <View style={styles.fieldGroup}>
            <View style={styles.avatarSection}>
              <Pressable
                onPress={handlePickAvatar}
                disabled={isUploadingAvatar}
                style={({ pressed }) => [
                  styles.avatarButton,
                  pressed && styles.avatarButtonPressed,
                ]}
              >
                {profile?.avatar_url ? (
                  <AppAvatar
                    url={profile.avatar_url}
                    size="xl"
                    fallback="user"
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarPlaceholderText}>Add photo</Text>
                  </View>
                )}
                {isUploadingAvatar ? (
                  <View style={styles.avatarOverlay}>
                    <ActivityIndicator color={colors.foreground} />
                  </View>
                ) : null}
              </Pressable>
              {avatarError ? <Text style={styles.error}>{avatarError}</Text> : null}
            </View>
            <View style={styles.fieldGroup}>
              {showUsernameGuidance ? (
                <View style={styles.usernameGuidance}>
                  <View style={styles.usernameGuidanceTextBlock}>
                    <Text style={styles.usernameGuidanceEyebrow}>Next step</Text>
                    <Text style={styles.usernameGuidanceTitle}>Review your username</Text>
                    <Text style={styles.usernameGuidanceBody}>
                      Keep this username if it feels right, or edit it and save your profile.
                    </Text>
                  </View>
                  <TailTagButton
                    variant="outline"
                    size="sm"
                    onPress={() => {
                      void markUsernameReviewed();
                    }}
                    disabled={!canKeepCurrentUsername}
                    style={styles.keepUsernameButton}
                  >
                    Keep this username
                  </TailTagButton>
                </View>
              ) : null}
              <Text style={styles.sectionTitle}>Username</Text>
              <TailTagInput
                value={usernameInput}
                style={styles.usernameInput}
                onChangeText={(value) => {
                  setHasEditedDraft(true);
                  setUsernameInput(value);
                  setSaveMessage(null);
                  setSaveError(null);
                }}
                editable={!isProfileLoading && !isSaving}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={USERNAME_MAX_LENGTH}
                placeholder="Choose a username that identifies you"
              />
              {usernameValidationMessage ? (
                <Text style={styles.usernameInvalid}>{usernameValidationMessage}</Text>
              ) : usernameCheckStatus === 'checking' ? (
                <Text style={styles.usernameChecking}>Checking availability…</Text>
              ) : usernameCheckStatus === 'available' ? (
                <Text style={styles.usernameAvailable}>Username is available</Text>
              ) : usernameCheckStatus === 'taken' ? (
                <Text style={styles.usernameTaken}>Username is already taken</Text>
              ) : usernameCheckStatus === 'error' ? (
                <Text style={styles.usernameError}>Could not verify availability. Try again.</Text>
              ) : null}
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.sectionTitle}>Bio</Text>
              <TailTagInput
                value={bioInput}
                onChangeText={(value) => {
                  setHasEditedDraft(true);
                  setBioInput(value);
                  setSaveMessage(null);
                  setSaveError(null);
                }}
                editable={!isProfileLoading && !isSaving}
                autoCapitalize="sentences"
                multiline
                numberOfLines={4}
                style={styles.bioInput}
                placeholder="Share species, favorite cons, or a quick hello."
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.sectionTitle}>Catch settings</Text>
              <CatchModeSwitch
                value={profile?.default_catch_mode ?? 'AUTO_ACCEPT'}
                onChange={handleCatchModeChange}
                disabled={isProfileLoading || isSavingCatchMode}
                scope="profile"
              />
              {catchModeError ? <Text style={styles.error}>{catchModeError}</Text> : null}
              {catchModeMessage ? <Text style={styles.success}>{catchModeMessage}</Text> : null}
            </View>
            {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
            <TailTagButton
              onPress={handleSave}
              disabled={
                !isDirty ||
                isProfileLoading ||
                isSaving ||
                hasUsernameValidationError ||
                isUsernameTaken ||
                isUsernameChecking
              }
              loading={isSaving}
            >
              {saveMessage ?? 'Save profile'}
            </TailTagButton>
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.sectionTitle}>Social links</Text>
          <Text style={styles.sectionDescription}>
            Add links so players can follow you on social media.
          </Text>
          <View style={styles.socialList}>
            {socialLinks.map((entry, index) => {
              const usedPlatformIds = socialLinks
                .filter(
                  (e) => e.id !== entry.id && e.platformId && e.platformId !== CUSTOM_PLATFORM_ID,
                )
                .map((e) => e.platformId);
              const isCustom = entry.platformId === CUSTOM_PLATFORM_ID;
              return (
                <View
                  key={entry.id}
                  style={styles.socialRow}
                >
                  <View style={styles.socialPlatformChips}>
                    {ALLOWED_SOCIAL_PLATFORMS.map((platform) => {
                      const isSelected = entry.platformId === platform.id;
                      const isUsedElsewhere = usedPlatformIds.includes(platform.id);
                      return (
                        <Pressable
                          key={platform.id}
                          onPress={() =>
                            !isUsedElsewhere &&
                            handleSocialLinkChange(entry.id, 'platformId', platform.id)
                          }
                          disabled={isSavingSocialLinks || isUsedElsewhere}
                          style={[
                            styles.socialPlatformChip,
                            isSelected && styles.socialPlatformChipSelected,
                            isUsedElsewhere && styles.socialPlatformChipDisabled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.socialPlatformChipText,
                              isSelected && styles.socialPlatformChipTextSelected,
                              isUsedElsewhere && styles.socialPlatformChipTextDisabled,
                            ]}
                          >
                            {platform.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() =>
                        handleSocialLinkChange(entry.id, 'platformId', CUSTOM_PLATFORM_ID)
                      }
                      disabled={isSavingSocialLinks}
                      style={[
                        styles.socialPlatformChip,
                        isCustom && styles.socialPlatformChipSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.socialPlatformChipText,
                          isCustom && styles.socialPlatformChipTextSelected,
                        ]}
                      >
                        Custom
                      </Text>
                    </Pressable>
                  </View>
                  {isCustom ? (
                    <View style={styles.socialCustomInputs}>
                      <TailTagInput
                        value={entry.label ?? ''}
                        onChangeText={(value) => handleSocialLinkChange(entry.id, 'label', value)}
                        placeholder="Label (e.g. Mastodon, Website)"
                        editable={!isSavingSocialLinks}
                        returnKeyType="next"
                        style={styles.socialInput}
                      />
                      <View style={styles.socialInputRow}>
                        <TailTagInput
                          value={entry.url ?? ''}
                          onChangeText={(value) => handleSocialLinkChange(entry.id, 'url', value)}
                          placeholder="https://example.com/you"
                          editable={!isSavingSocialLinks}
                          autoCapitalize="none"
                          keyboardType="url"
                          returnKeyType={index === socialLinks.length - 1 ? 'done' : 'next'}
                          style={styles.socialInput}
                        />
                        <TailTagButton
                          variant="ghost"
                          size="sm"
                          onPress={() => handleRemoveSocialLink(entry.id)}
                          disabled={isSavingSocialLinks}
                          style={styles.socialRemoveButton}
                        >
                          Remove
                        </TailTagButton>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.socialInputRow}>
                      <TailTagInput
                        value={entry.handle}
                        onChangeText={(value) => handleSocialLinkChange(entry.id, 'handle', value)}
                        placeholder="Username"
                        editable={!isSavingSocialLinks}
                        autoCapitalize="none"
                        returnKeyType={index === socialLinks.length - 1 ? 'done' : 'next'}
                        style={styles.socialInput}
                      />
                      <TailTagButton
                        variant="ghost"
                        size="sm"
                        onPress={() => handleRemoveSocialLink(entry.id)}
                        disabled={isSavingSocialLinks}
                        style={styles.socialRemoveButton}
                      >
                        Remove
                      </TailTagButton>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          {socialLinksCanAddMore ? (
            <TailTagButton
              variant="outline"
              size="sm"
              onPress={handleAddSocialLink}
              disabled={isSavingSocialLinks}
            >
              Add a link
            </TailTagButton>
          ) : (
            <Text style={styles.helperLabel}>You can add up to {SOCIAL_LINK_LIMIT} links.</Text>
          )}
          {socialLinksError ? <Text style={styles.error}>{socialLinksError}</Text> : null}
          {socialLinksMessage ? <Text style={styles.success}>{socialLinksMessage}</Text> : null}
          <TailTagButton
            onPress={handleSaveSocialLinks}
            disabled={isSavingSocialLinks}
            loading={isSavingSocialLinks}
            style={styles.saveSocialLinksButton}
          >
            Save links
          </TailTagButton>
        </View>
      </TailTagCard>

      <TailTagCard>
        <View style={styles.conventionSection}>
          <Text style={styles.sectionTitle}>Convention attendance</Text>
          <Text style={styles.sectionDescription}>
            Join upcoming and live conventions so TailTag is ready when catching opens.
          </Text>

          {isConventionsBusy ? (
            <Text style={styles.message}>Loading conventions…</Text>
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
              >
                Try again
              </TailTagButton>
            </View>
          ) : conventions.length === 0 ? (
            <Text style={styles.message}>No conventions are open for joining right now.</Text>
          ) : (
            <View style={styles.conventionList}>
              {conventions.map((convention) => {
                const isSelected = selectedConventionIdSet.has(convention.id);
                const membership = conventionMembershipById.get(convention.id);
                const membershipKey = `profile:${userId}:${convention.id}`;
                const isPending = pendingMemberships.has(membershipKey);

                return (
                  <ConventionToggle
                    key={`profile-${convention.id}`}
                    convention={convention}
                    selected={isSelected}
                    pending={isPending || isVerifyingConvention}
                    badgeText={conventionBadgeText(
                      convention,
                      isSelected,
                      membership?.membership_state,
                    )}
                    membershipState={membership?.membership_state}
                    profileId={userId ?? undefined}
                    onVerifyLocation={verifyConvention}
                    onToggle={(conventionId, nextSelected, verifiedLocation) =>
                      handleToggleProfileConvention(conventionId, nextSelected, verifiedLocation)
                    }
                  />
                );
              })}
            </View>
          )}

          {conventionError ? <Text style={styles.error}>{conventionError}</Text> : null}
          {verificationModals}
        </View>
      </TailTagCard>

      <TailTagCard>
        <View style={styles.accountSection}>
          <Text style={styles.sectionTitle}>Push Notifications</Text>
          <Text style={styles.sectionDescription}>
            Get alerts when you unlock achievements or catches change status.
          </Text>
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.sectionSubtitle}>Enable push notifications</Text>
              <Text style={styles.sectionHint}>
                {isPushDenied
                  ? 'Turn on notifications in Settings to re-enable push.'
                  : 'We only send important game updates.'}
              </Text>
            </View>
            <Switch
              value={displayPushToggleOn}
              onValueChange={handleTogglePush}
              disabled={!canTogglePush}
              trackColor={{
                false: 'rgba(148,163,184,0.3)',
                true: colors.primaryDark,
              }}
              thumbColor={displayPushToggleOn ? colors.primary : 'rgba(203,213,225,0.9)'}
              ios_backgroundColor="rgba(148,163,184,0.3)"
              accessibilityRole="switch"
              accessibilityLabel="Enable push notifications"
              accessibilityHint="Toggle push notifications on or off."
              accessibilityState={{
                checked: displayPushToggleOn,
                disabled: !canTogglePush,
              }}
            />
          </View>
          {!isPushSupported ? (
            <Text style={styles.warning}>Push notifications require a physical device.</Text>
          ) : null}
          {isPushDenied ? (
            <Text style={styles.warning}>Notifications are disabled in system settings.</Text>
          ) : null}
          {pushError ? <Text style={styles.error}>{pushError}</Text> : null}
        </View>
      </TailTagCard>

      {staffModeAllowed ? (
        <TailTagCard>
          <View style={styles.accountSection}>
            <Text style={styles.sectionTitle}>Staff Mode</Text>
            <Text style={styles.sectionDescription}>
              On-site search and scan tools for staff, organizers, and owners.
            </Text>
            <TailTagButton onPress={() => router.push('/staff-mode')}>
              Open Staff Mode
            </TailTagButton>
            <Text style={styles.sectionHint}>
              Use Staff Mode to look up players and open event tools quickly.
            </Text>
          </View>
        </TailTagCard>
      ) : null}

      <TailTagCard>
        <View style={styles.accountSection}>
          <Text style={styles.sectionTitle}>Beta Feedback</Text>
          <Text style={styles.sectionDescription}>
            Found a bug or have a suggestion? Let us know!
          </Text>
          <TailTagButton
            variant="outline"
            onPress={handleOpenFeedbackForm}
          >
            Report a Bug or Give Feedback
          </TailTagButton>
        </View>
      </TailTagCard>

      <TailTagCard>
        <View style={styles.accountSection}>
          <Text style={styles.sectionTitle}>Legal & privacy</Text>
          <Text style={styles.sectionDescription}>
            Review how TailTag handles your data, account deletion requests, and beta terms.
          </Text>
          <TailTagButton
            variant="outline"
            onPress={() => void handleOpenExternalUrl(PRIVACY_POLICY_URL)}
          >
            Privacy Policy
          </TailTagButton>
          <TailTagButton
            variant="outline"
            onPress={() => void handleOpenExternalUrl(DELETE_ACCOUNT_URL)}
          >
            Delete Account Help
          </TailTagButton>
          <TailTagButton
            variant="outline"
            onPress={() => void handleOpenExternalUrl(TERMS_URL)}
          >
            Terms of Service
          </TailTagButton>
          <TailTagButton
            variant="ghost"
            onPress={() => void handleOpenExternalUrl(SUPPORT_EMAIL_URL)}
          >
            Contact Support
          </TailTagButton>
        </View>
      </TailTagCard>

      <TailTagCard>
        <View style={styles.accountSection}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.sectionDescription}>
            Log out of TailTag or delete your account entirely.
          </Text>
          {hasEmailAddress ? (
            <TailTagButton
              variant="outline"
              onPress={() => router.push('/change-password')}
            >
              {passwordActionLabel}
            </TailTagButton>
          ) : (
            <>
              <TailTagButton
                variant="outline"
                disabled
              >
                Set password
              </TailTagButton>
              <Text style={styles.sectionHint}>
                Password sign-in is unavailable because this account does not have an email address.
              </Text>
            </>
          )}
          {signOutError ? <Text style={styles.error}>{signOutError}</Text> : null}
          <TailTagButton
            onPress={handleSignOut}
            loading={isSigningOut}
          >
            Log out
          </TailTagButton>
          {deleteAccountError ? <Text style={styles.error}>{deleteAccountError}</Text> : null}
          <TailTagButton
            variant="destructive"
            onPress={handleDeleteAccount}
            loading={isDeletingAccount}
            disabled={!userId}
          >
            Delete account
          </TailTagButton>
          <Text style={styles.sectionHint}>
            Deleting your account removes all catches, fursuits, photos, achievements, and daily
            progress.
          </Text>
          <Text style={styles.warning}>This action cannot be undone.</Text>
        </View>
      </TailTagCard>
    </KeyboardAwareFormWrapper>
  );
}

function RecapStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.recapStat}>
      <Text style={styles.recapStatValue}>{value.toLocaleString()}</Text>
      <Text style={styles.recapStatLabel}>{label}</Text>
    </View>
  );
}

function formatRecapDateRange(recap: PastConventionRecap) {
  if (recap.startDate && recap.endDate) {
    return `${formatShortDate(recap.startDate)} to ${formatShortDate(recap.endDate)}`;
  }

  if (recap.endDate) return formatShortDate(recap.endDate);
  if (recap.startDate) return formatShortDate(recap.startDate);
  return recap.location ?? 'Archived event';
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
