import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Switch,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MenuView } from "@react-native-menu/menu";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";

import * as Linking from "expo-linking";
import { useFocusEffect, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AppAvatar } from "../../src/components/ui/AppAvatar";
import { TailTagButton } from "../../src/components/ui/TailTagButton";
import { TailTagCard } from "../../src/components/ui/TailTagCard";
import { TailTagInput } from "../../src/components/ui/TailTagInput";
import { KeyboardAwareFormWrapper } from "../../src/components/ui/KeyboardAwareFormWrapper";
import { STAFF_MODE_ENABLED } from "../../src/constants/features";
import {
  CONVENTIONS_QUERY_KEY,
  CONVENTIONS_STALE_TIME,
  fetchConventions,
  fetchProfileConventionIds,
  optInToConvention,
  optOutOfConvention,
  PROFILE_CONVENTIONS_QUERY_KEY,
} from "../../src/features/conventions";
import { useAuth } from "../../src/features/auth";
import type {
  ConventionSummary,
  VerifiedLocation,
} from "../../src/features/conventions";
import { ConventionToggle } from "../../src/components/conventions/ConventionToggle";
import { supabase } from "../../src/lib/supabase";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../../src/lib/runtimeConfig";
import { captureHandledException } from "../../src/lib/sentry";
import { colors } from "../../src/theme";
import {
  buildImageUploadCandidate,
  extractStoragePath,
} from "../../src/utils/images";
import { PROFILE_AVATAR_BUCKET } from "../../src/constants/storage";
import { emitGameplayEvent } from "../../src/features/events";
import { DAILY_TASKS_QUERY_KEY } from "../../src/features/daily-tasks/hooks";
import {
  checkUsernameAvailability,
  fetchProfile,
  normalizeUsernameInput,
  USERNAME_MAX_LENGTH,
  uploadProfileAvatar,
  updateProfileAvatar,
  updateProfileSocialLinks,
  validateUsername,
  PROFILE_QUERY_KEY,
  PROFILE_STALE_TIME,
} from "../../src/features/profile";
import type { ProfileSummary } from "../../src/features/profile";
import type { FursuitPhotoCandidate } from "../../src/features/onboarding/api/onboarding";
import type { EditableSocialLink } from "../../src/features/suits/forms/socialLinks";
import {
  ALLOWED_SOCIAL_PLATFORMS,
  CUSTOM_PLATFORM_ID,
  SOCIAL_LINK_LIMIT,
  createEmptySocialLink,
  mapEditableSocialLinks,
  socialLinksToSave,
} from "../../src/features/suits/forms/socialLinks";
import { canUseStaffMode } from "../../src/features/staff-mode/constants";
import {
  CAUGHT_SUITS_QUERY_KEY,
  CAUGHT_SUITS_STALE_TIME,
  caughtSuitsQueryKey,
  fetchCaughtSuits,
} from "../../src/features/suits/api/caughtSuits";
import type { CaughtRecord } from "../../src/features/suits/api/caughtSuits";
import { CONVENTION_LEADERBOARD_QUERY_KEY } from "../../src/features/leaderboard/api/leaderboard";
import { usePushNotifications } from "../../src/features/push-notifications";
import { styles } from "../../src/app-styles/(tabs)/settings.styles";

const FEEDBACK_FORM_URL = "https://forms.gle/e65DqKt1VsuvoFTx8";

export default function SettingsScreen() {
  const router = useRouter();
  const { session, forceSignOut } = useAuth();
  const userId = session?.user.id ?? null;

  const queryClient = useQueryClient();
  const profileQueryKey = useMemo(
    () => [PROFILE_QUERY_KEY, userId] as const,
    [userId],
  );
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

  const conventionsQueryKey = useMemo(
    () => [CONVENTIONS_QUERY_KEY] as const,
    [],
  );
  const profileConventionQueryKey = useMemo(
    () => [PROFILE_CONVENTIONS_QUERY_KEY, userId] as const,
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
    queryFn: () => fetchConventions(),
  });

  const {
    data: profileConventionIds = [],
    error: profileConventionsError,
    isLoading: isProfileConventionsLoading,
    refetch: refetchProfileConventions,
  } = useQuery<string[], Error>({
    queryKey: profileConventionQueryKey,
    enabled: Boolean(userId),
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchProfileConventionIds(userId!),
  });

  const caughtSuitsQueryKeyValue = useMemo(
    () =>
      userId
        ? caughtSuitsQueryKey(userId)
        : ([CAUGHT_SUITS_QUERY_KEY] as const),
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

  const [usernameInput, setUsernameInput] = useState("");
  const [bioInput, setBioInput] = useState("");

  type UsernameCheckStatus =
    | "idle"
    | "checking"
    | "available"
    | "taken"
    | "error";
  const [usernameCheckStatus, setUsernameCheckStatus] =
    useState<UsernameCheckStatus>("idle");
  const usernameCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [optimisticPushEnabled, setOptimisticPushEnabled] = useState<
    boolean | null
  >(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [socialLinks, setSocialLinks] = useState<EditableSocialLink[]>(() => [
    createEmptySocialLink(),
  ]);
  const [isSavingSocialLinks, setIsSavingSocialLinks] = useState(false);
  const [socialLinksError, setSocialLinksError] = useState<string | null>(null);
  const [socialLinksMessage, setSocialLinksMessage] = useState<string | null>(
    null,
  );
  const [hasHydratedSocialLinks, setHasHydratedSocialLinks] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(
    null,
  );
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const isDeletingAccountRef = useRef(false);
  const [conventionError, setConventionError] = useState<string | null>(null);
  const [pendingMemberships, setPendingMemberships] = useState<Set<string>>(
    () => new Set(),
  );

  const selectedConventionIdSet = useMemo(
    () => new Set(profileConventionIds),
    [profileConventionIds],
  );

  const normalizedUsernameInput = useMemo(
    () => normalizeUsernameInput(usernameInput),
    [usernameInput],
  );
  const normalizedProfileUsername = useMemo(
    () => normalizeUsernameInput(profile?.username ?? ""),
    [profile?.username],
  );
  const usernameValidation = useMemo(
    () => validateUsername(normalizedUsernameInput, { allowEmpty: true }),
    [normalizedUsernameInput],
  );
  const hasUsernameValidationError =
    normalizedUsernameInput.length > 0 && !usernameValidation.isValid;
  const usernameValidationMessage = hasUsernameValidationError
    ? usernameValidation.message
    : null;

  const isDirty = useMemo(() => {
    const usernameChanged =
      normalizedProfileUsername !== normalizedUsernameInput;
    const bioChanged = (profile?.bio ?? "") !== bioInput.trim();
    return usernameChanged || bioChanged;
  }, [
    bioInput,
    normalizedProfileUsername,
    normalizedUsernameInput,
    profile?.bio,
  ]);

  const resetDraftFromProfile = useCallback(
    (
      summary: ProfileSummary | null,
      options: { resetMessages?: boolean } = {},
    ) => {
      const { resetMessages = true } = options;

      setUsernameInput(summary?.username ?? "");
      setBioInput(summary?.bio ?? "");

      if (resetMessages) {
        setSaveMessage(null);
        setSaveError(null);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        resetDraftFromProfile(null);
        return;
      }

      if (!isDirty) {
        resetDraftFromProfile(profile, { resetMessages: true });
      }
      const profileState = queryClient.getQueryState<ProfileSummary | null>(
        profileQueryKey,
      );

      if (
        !profileState ||
        profileState.isInvalidated ||
        (profileState.status === "success" &&
          Date.now() - profileState.dataUpdatedAt > PROFILE_STALE_TIME)
      ) {
        void refetchProfile({ throwOnError: false });
      }

      const conventionsState =
        queryClient.getQueryState<ConventionSummary[]>(conventionsQueryKey);

      if (
        !conventionsState ||
        conventionsState.isInvalidated ||
        (conventionsState.status === "success" &&
          Date.now() - conventionsState.dataUpdatedAt > CONVENTIONS_STALE_TIME)
      ) {
        void refetchConventions({ throwOnError: false });
      }

      const profileConventionsState = queryClient.getQueryState<string[]>(
        profileConventionQueryKey,
      );

      if (
        !profileConventionsState ||
        profileConventionsState.isInvalidated ||
        (profileConventionsState.status === "success" &&
          Date.now() - profileConventionsState.dataUpdatedAt >
            CONVENTIONS_STALE_TIME)
      ) {
        void refetchProfileConventions({ throwOnError: false });
      }

      const caughtSuitsState = queryClient.getQueryState<CaughtRecord[]>(
        caughtSuitsQueryKeyValue,
      );

      if (
        !caughtSuitsState ||
        caughtSuitsState.isInvalidated ||
        (caughtSuitsState.status === "success" &&
          Date.now() - caughtSuitsState.dataUpdatedAt > CAUGHT_SUITS_STALE_TIME)
      ) {
        void refetchCaughtSuits({ throwOnError: false });
      }

      void refreshPushState();
    }, [
      isDirty,
      profile,
      profileQueryKey,
      queryClient,
      refetchProfile,
      resetDraftFromProfile,
      userId,
      conventionsQueryKey,
      refetchConventions,
      profileConventionQueryKey,
      refetchProfileConventions,
      caughtSuitsQueryKeyValue,
      refetchCaughtSuits,
      refreshPushState,
    ]),
  );

  useEffect(() => {
    if (!userId) {
      resetDraftFromProfile(null);
      return;
    }

    if (isDirty || isSaving) {
      return;
    }

    resetDraftFromProfile(profile, { resetMessages: false });
  }, [isDirty, isSaving, profile, resetDraftFromProfile, userId]);

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
    if (usernameCheckRef.current) {
      clearTimeout(usernameCheckRef.current);
    }

    // No check needed if empty or unchanged from saved profile
    if (
      !normalizedUsernameInput ||
      normalizedUsernameInput === normalizedProfileUsername ||
      !usernameValidation.isValid
    ) {
      setUsernameCheckStatus("idle");
      return;
    }

    setUsernameCheckStatus("checking");

    usernameCheckRef.current = setTimeout(() => {
      if (!userId) return;
      checkUsernameAvailability(normalizedUsernameInput, userId)
        .then((available) => {
          setUsernameCheckStatus(available ? "available" : "taken");
        })
        .catch(() => {
          setUsernameCheckStatus("error");
        });
    }, 500);

    return () => {
      if (usernameCheckRef.current) {
        clearTimeout(usernameCheckRef.current);
      }
    };
  }, [
    normalizedProfileUsername,
    normalizedUsernameInput,
    userId,
    usernameValidation.isValid,
  ]);

  const conventionsLoadError =
    conventionsError?.message ?? profileConventionsError?.message ?? null;
  const isConventionsBusy = isConventionsLoading || isProfileConventionsLoading;

  const statsError =
    caughtSuitsError?.message ?? profileConventionsError?.message ?? null;
  const isStatsLoading = isCaughtSuitsLoading || isProfileConventionsLoading;
  const caughtSuitCount = caughtSuits.length;
  const attendedConventionCount = profileConventionIds.length;
  const staffModeAllowed = useMemo(
    () => STAFF_MODE_ENABLED && canUseStaffMode(profile?.role ?? null),
    [profile?.role],
  );
  const isPushDenied = permissionStatus === "denied";
  const canTogglePush = isPushSupported && !isPushRegistering;
  const isPushToggleOn =
    isPushSupported && permissionStatus === "granted" && isPushEnabled;
  const displayPushToggleOn = optimisticPushEnabled ?? isPushToggleOn;

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
                "Notifications Blocked",
                "Notifications for TailTag are disabled. To enable them, open your device settings and allow notifications for TailTag.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Open Settings",
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

  const isUsernameTaken = usernameCheckStatus === "taken";
  const isUsernameChecking = usernameCheckStatus === "checking";

  const handleSave = useCallback(async () => {
    if (!userId || isSaving || !isDirty) {
      return;
    }

    const trimmedUsername = normalizedUsernameInput;
    const trimmedBio = bioInput.trim();
    const normalizedUsername =
      trimmedUsername.length > 0 ? trimmedUsername : null;
    const normalizedBio = trimmedBio.length > 0 ? trimmedBio : null;

    if (normalizedUsername) {
      const validation = validateUsername(normalizedUsername);
      if (!validation.isValid) {
        setSaveError(validation.message ?? "Please enter a valid username.");
        return;
      }
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const { error } = await (supabase as any).from("profiles").upsert(
        {
          id: userId,
          username: normalizedUsername,
          bio: normalizedBio,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (error) {
        throw error;
      }

      queryClient.setQueryData<ProfileSummary | null>(
        profileQueryKey,
        (current) =>
          current
            ? {
                ...current,
                username: normalizedUsername,
                bio: normalizedBio,
              }
            : {
                username: normalizedUsername,
                bio: normalizedBio,
                avatar_url: null,
                social_links: [],
                is_new: false,
                onboarding_completed: false,
              },
      );
      setUsernameInput(trimmedUsername);
      setBioInput(trimmedBio);
      setSaveMessage("Profile updated");

      // Fire-and-forget: don't block UI on event emission
      void emitGameplayEvent({
        type: "profile_updated",
        payload: {
          username_present: trimmedUsername.length > 0,
          bio_present: trimmedBio.length > 0,
          avatar_present: Boolean(profile?.avatar_url),
        },
      }).catch((error) => {
        captureHandledException(error, {
          scope: "settings.handleSave.profileUpdated",
          userId,
        });
      });
      void queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error
          ? caught.message
          : "We could not update your profile right now. Please try again.";
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
    profile?.avatar_url,
    profileQueryKey,
    queryClient,
  ]);

  const handlePickAvatar = useCallback(async () => {
    if (!userId || isUploadingAvatar) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const photo: FursuitPhotoCandidate = buildImageUploadCandidate(
      asset,
      `avatar-${Date.now()}`,
    );

    setIsUploadingAvatar(true);
    setAvatarError(null);

    try {
      const oldAvatarUrl =
        queryClient.getQueryData<ProfileSummary | null>(profileQueryKey)
          ?.avatar_url ?? null;
      const publicUrl = await uploadProfileAvatar(userId, photo);
      await updateProfileAvatar(userId, publicUrl);
      queryClient.setQueryData<ProfileSummary | null>(
        profileQueryKey,
        (current) =>
          current ? { ...current, avatar_url: publicUrl } : current,
      );
      void emitGameplayEvent({
        type: "profile_updated",
        payload: {
          username_present: Boolean(profile?.username?.trim()),
          bio_present: Boolean(profile?.bio?.trim()),
          avatar_present: true,
        },
      }).catch((error) => {
        captureHandledException(error, {
          scope: "settings.handlePickAvatar.profileUpdated",
          userId,
        });
      });
      const oldPath = extractStoragePath(oldAvatarUrl, PROFILE_AVATAR_BUCKET);
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
  }, [
    userId,
    isUploadingAvatar,
    profile?.bio,
    profile?.username,
    profileQueryKey,
    queryClient,
  ]);

  const socialLinksCanAddMore = socialLinks.length < SOCIAL_LINK_LIMIT;

  const handleSocialLinkChange = (
    id: string,
    field: "platformId" | "handle" | "label" | "url",
    value: string,
  ) => {
    setSocialLinks((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry,
      ),
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

    const normalized = socialLinksToSave(socialLinks);

    setIsSavingSocialLinks(true);
    setSocialLinksError(null);
    setSocialLinksMessage(null);

    try {
      await updateProfileSocialLinks(userId, normalized);
      queryClient.setQueryData<ProfileSummary | null>(
        profileQueryKey,
        (current) =>
          current ? { ...current, social_links: normalized } : current,
      );
      setSocialLinksMessage("Social links saved");
    } catch (caught) {
      setSocialLinksError(
        caught instanceof Error
          ? caught.message
          : "Could not save social links. Try again.",
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
        const previouslySelectedConventionIds = (
          profileConventionIds ?? []
        ).filter((id) => id !== conventionId);

        if (!nextSelected) {
          await optOutOfConvention(userId, conventionId);
          queryClient.setQueryData<string[]>(
            profileConventionQueryKey,
            (current) =>
              (current ?? []).filter((value) => value !== conventionId),
          );
        } else {
          await optInToConvention({
            profileId: userId,
            conventionId,
            verifiedLocation: verifiedLocation ?? undefined,
            verificationMethod: verifiedLocation ? "gps" : "none",
          });
          queryClient.setQueryData<string[]>(profileConventionQueryKey, [
            conventionId,
          ]);
        }
        void queryClient.invalidateQueries({
          queryKey: [DAILY_TASKS_QUERY_KEY],
        });
        void queryClient.invalidateQueries({
          queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, conventionId],
        });
        previouslySelectedConventionIds.forEach((id) => {
          void queryClient.invalidateQueries({
            queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, id],
          });
        });
      } catch (caught) {
        const fallbackMessage =
          caught instanceof Error
            ? caught.message
            : "We could not update your conventions right now. Please try again.";
        setConventionError(fallbackMessage);
      } finally {
        setPendingMemberships((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [
      pendingMemberships,
      profileConventionIds,
      profileConventionQueryKey,
      queryClient,
      userId,
    ],
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
        throw new Error("No session found");
      }

      const supabaseUrl = SUPABASE_URL;
      const supabaseKey = SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error("Missing config");
      }

      // Call Edge Function
      const response = await fetch(
        `${supabaseUrl}/functions/v1/delete-account`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: supabaseKey,
          },
        },
      );

      if (!response.ok) {
        let errorMessage = "Deletion failed";
        try {
          const payload = (await response.json()) as { error?: string };
          if (typeof payload.error === "string" && payload.error.length > 0) {
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
      Alert.alert(
        "Account Deleted",
        "Your account has been permanently deleted.",
      );
    } catch (caught) {
      setDeleteAccountError(
        caught instanceof Error ? caught.message : "Deletion failed",
      );
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
      "Delete account?",
      "Deleting your account will permanently remove your profile, fursuits, catches, achievements, and daily task progress. This can't be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete account",
          style: "destructive",
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
            if (nativeEvent.event === "blocked-users") {
              router.push("/blocked-users");
            }
          }}
          actions={[
            {
              id: "blocked-users",
              title: "Blocked users",
              image: "hand.raised",
            },
          ]}
        >
          <Pressable style={styles.menuButton} hitSlop={8}>
            <Ionicons
              name="ellipsis-vertical"
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        </MenuView>
      </View>

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
                }}
              >
                Try again
              </TailTagButton>
            </View>
          ) : (
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {caughtSuitCount.toLocaleString()}
                </Text>
                <Text style={styles.statLabel}>Fursuits caught</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {attendedConventionCount.toLocaleString()}
                </Text>
                <Text style={styles.statLabel}>Conventions attended</Text>
              </View>
            </View>
          )}
        </View>
      </TailTagCard>

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
              {avatarError ? (
                <Text style={styles.error}>{avatarError}</Text>
              ) : null}
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.sectionTitle}>Username</Text>
              <TailTagInput
                value={usernameInput}
                onChangeText={(value) => {
                  setUsernameInput(normalizeUsernameInput(value));
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
                <Text style={styles.usernameInvalid}>
                  {usernameValidationMessage}
                </Text>
              ) : usernameCheckStatus === "checking" ? (
                <Text style={styles.usernameChecking}>
                  Checking availability…
                </Text>
              ) : usernameCheckStatus === "available" ? (
                <Text style={styles.usernameAvailable}>
                  Username is available
                </Text>
              ) : usernameCheckStatus === "taken" ? (
                <Text style={styles.usernameTaken}>
                  Username is already taken
                </Text>
              ) : usernameCheckStatus === "error" ? (
                <Text style={styles.usernameError}>
                  Could not verify availability. Try again.
                </Text>
              ) : null}
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.sectionTitle}>Bio</Text>
              <TailTagInput
                value={bioInput}
                onChangeText={(value) => {
                  setBioInput(value);
                  setSaveMessage(null);
                  setSaveError(null);
                }}
                editable={!isProfileLoading && !isSaving}
                multiline
                numberOfLines={4}
                style={styles.bioInput}
                placeholder="Share species, favorite cons, or a quick hello."
              />
            </View>
            {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
            {saveMessage ? (
              <Text style={styles.success}>{saveMessage}</Text>
            ) : null}
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
              Save profile
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
                  (e) =>
                    e.id !== entry.id &&
                    e.platformId &&
                    e.platformId !== CUSTOM_PLATFORM_ID,
                )
                .map((e) => e.platformId);
              const isCustom = entry.platformId === CUSTOM_PLATFORM_ID;
              return (
                <View key={entry.id} style={styles.socialRow}>
                  <View style={styles.socialPlatformChips}>
                    {ALLOWED_SOCIAL_PLATFORMS.map((platform) => {
                      const isSelected = entry.platformId === platform.id;
                      const isUsedElsewhere = usedPlatformIds.includes(
                        platform.id,
                      );
                      return (
                        <Pressable
                          key={platform.id}
                          onPress={() =>
                            !isUsedElsewhere &&
                            handleSocialLinkChange(
                              entry.id,
                              "platformId",
                              platform.id,
                            )
                          }
                          disabled={isSavingSocialLinks || isUsedElsewhere}
                          style={[
                            styles.socialPlatformChip,
                            isSelected && styles.socialPlatformChipSelected,
                            isUsedElsewhere &&
                              styles.socialPlatformChipDisabled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.socialPlatformChipText,
                              isSelected &&
                                styles.socialPlatformChipTextSelected,
                              isUsedElsewhere &&
                                styles.socialPlatformChipTextDisabled,
                            ]}
                          >
                            {platform.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() =>
                        handleSocialLinkChange(
                          entry.id,
                          "platformId",
                          CUSTOM_PLATFORM_ID,
                        )
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
                        value={entry.label ?? ""}
                        onChangeText={(value) =>
                          handleSocialLinkChange(entry.id, "label", value)
                        }
                        placeholder="Label (e.g. Mastodon, Website)"
                        editable={!isSavingSocialLinks}
                        returnKeyType="next"
                        style={styles.socialInput}
                      />
                      <View style={styles.socialInputRow}>
                        <TailTagInput
                          value={entry.url ?? ""}
                          onChangeText={(value) =>
                            handleSocialLinkChange(entry.id, "url", value)
                          }
                          placeholder="https://example.com/you"
                          editable={!isSavingSocialLinks}
                          autoCapitalize="none"
                          keyboardType="url"
                          returnKeyType={
                            index === socialLinks.length - 1 ? "done" : "next"
                          }
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
                        onChangeText={(value) =>
                          handleSocialLinkChange(entry.id, "handle", value)
                        }
                        placeholder="Username"
                        editable={!isSavingSocialLinks}
                        autoCapitalize="none"
                        returnKeyType={
                          index === socialLinks.length - 1 ? "done" : "next"
                        }
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
            <Text style={styles.helperLabel}>
              You can add up to {SOCIAL_LINK_LIMIT} links.
            </Text>
          )}
          {socialLinksError ? (
            <Text style={styles.error}>{socialLinksError}</Text>
          ) : null}
          {socialLinksMessage ? (
            <Text style={styles.success}>{socialLinksMessage}</Text>
          ) : null}
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
            Assign your current convention so catches only count when everyone
            is on-site.
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
            <Text style={styles.message}>
              No conventions are available yet. Check back soon.
            </Text>
          ) : (
            <View style={styles.conventionList}>
              {conventions.map((convention) => {
                const isSelected = selectedConventionIdSet.has(convention.id);
                const membershipKey = `profile:${userId}:${convention.id}`;
                const isPending = pendingMemberships.has(membershipKey);

                return (
                  <ConventionToggle
                    key={`profile-${convention.id}`}
                    convention={convention}
                    selected={isSelected}
                    pending={isPending}
                    profileId={userId ?? undefined}
                    onToggle={(conventionId, nextSelected, verifiedLocation) =>
                      handleToggleProfileConvention(
                        conventionId,
                        nextSelected,
                        verifiedLocation,
                      )
                    }
                  />
                );
              })}
            </View>
          )}

          {conventionError ? (
            <Text style={styles.error}>{conventionError}</Text>
          ) : null}
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
              <Text style={styles.sectionSubtitle}>
                Enable push notifications
              </Text>
              <Text style={styles.sectionHint}>
                {isPushDenied
                  ? "Turn on notifications in Settings to re-enable push."
                  : "We only send important game updates."}
              </Text>
            </View>
            <Switch
              value={displayPushToggleOn}
              onValueChange={handleTogglePush}
              disabled={!canTogglePush}
              trackColor={{
                false: "rgba(148,163,184,0.3)",
                true: colors.primaryDark,
              }}
              thumbColor={
                displayPushToggleOn ? colors.primary : "rgba(203,213,225,0.9)"
              }
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
            <Text style={styles.warning}>
              Push notifications require a physical device.
            </Text>
          ) : null}
          {isPushDenied ? (
            <Text style={styles.warning}>
              Notifications are disabled in system settings.
            </Text>
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
            <TailTagButton onPress={() => router.push("/staff-mode")}>
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
          <TailTagButton variant="outline" onPress={handleOpenFeedbackForm}>
            Report a Bug or Give Feedback
          </TailTagButton>
        </View>
      </TailTagCard>

      <TailTagCard>
        <View style={styles.accountSection}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.sectionDescription}>
            Log out of TailTag or delete your account entirely.
          </Text>
          {signOutError ? (
            <Text style={styles.error}>{signOutError}</Text>
          ) : null}
          <TailTagButton onPress={handleSignOut} loading={isSigningOut}>
            Log out
          </TailTagButton>
          {deleteAccountError ? (
            <Text style={styles.error}>{deleteAccountError}</Text>
          ) : null}
          <TailTagButton
            variant="destructive"
            onPress={handleDeleteAccount}
            loading={isDeletingAccount}
            disabled={!userId}
          >
            Delete account
          </TailTagButton>
          <Text style={styles.sectionHint}>
            Deleting your account removes all catches, fursuits, photos,
            achievements, and daily progress.
          </Text>
          <Text style={styles.warning}>This action cannot be undone.</Text>
        </View>
      </TailTagCard>
    </KeyboardAwareFormWrapper>
  );
}
