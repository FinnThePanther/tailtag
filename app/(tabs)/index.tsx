import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Image } from 'expo-image';
import { AppAvatar } from '../../src/components/ui/AppAvatar';
import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { TailTagProgressBar } from '../../src/components/ui/TailTagProgressBar';
import { useAuth } from '../../src/features/auth';
import { fetchProfile, profileQueryKey } from '../../src/features/profile';
import { supabase } from '../../src/lib/supabase';
import { captureHandledException } from '../../src/lib/sentry';
import {
  ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY,
  CONVENTIONS_STALE_TIME,
  PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY,
  type ConventionMembership,
  type ConventionSummary,
  type PastConventionRecap,
  fetchActiveProfileConventionIds,
  fetchJoinableConventions,
  fetchProfileConventionMemberships,
  fetchPastConventionRecaps,
  JOINABLE_CONVENTIONS_QUERY_KEY,
  PAST_CONVENTION_RECAPS_QUERY_KEY,
} from '../../src/features/conventions';
import {
  CONVENTION_LEADERBOARD_QUERY_KEY,
  CONVENTION_SUIT_LEADERBOARD_QUERY_KEY,
  createConventionLeaderboardQueryOptions,
  createConventionSuitLeaderboardQueryOptions,
  type LeaderboardEntry,
  type SuitLeaderboardEntry,
} from '../../src/features/leaderboard';
import {
  fetchAchievementStatus,
  achievementsStatusQueryKey,
  type AchievementWithStatus,
  AchievementsSummarySkeleton,
} from '../../src/features/achievements';
import {
  createProfileGuidanceState,
  goalsViewedStorageKey,
  readyConfirmationSeenStorageKey,
  readProfileGuidanceFlag,
  usernameReviewedStorageKey,
  writeProfileGuidanceFlag,
  type ProfileGuidanceTask,
  type ProfileGuidanceTaskId,
} from '../../src/features/profile-guidance';
import { emitGameplayEvent } from '../../src/features/events';
import {
  useDailyTasks,
  DAILY_TASKS_QUERY_KEY,
  DailyTasksSummarySkeleton,
} from '../../src/features/daily-tasks';
import { LeaderboardSectionSkeleton } from '../../src/features/leaderboard';
import {
  fetchMySuits,
  mySuitsQueryKey,
  MY_SUITS_STALE_TIME,
  type FursuitSummary,
} from '../../src/features/suits';
import { useAllDataReady } from '../../src/hooks/useAllDataReady';
import { useToast } from '../../src/hooks/useToast';
import { colors, spacing } from '../../src/theme';
import { getStorageAuthHeaders, getTransformedImageUrl } from '../../src/utils/supabase-image';
import { styles } from '../../src/app-styles/(tabs)/index.styles';

const MAX_LEADERBOARD_ENTRIES = 5;
const recapBannerStateKey = (userId: string) => `tailtag:recap-banner-state:${userId}`;

const formatCatchCount = (count: number) => (count === 1 ? '1 catch' : `${count} catches`);

type RecapBannerState = {
  seenRecapIds: string[];
  dismissedRecapIds: string[];
};

const EMPTY_RECAP_BANNER_STATE: RecapBannerState = {
  seenRecapIds: [],
  dismissedRecapIds: [],
};

const asRecapIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter(
        (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
      ),
    ),
  );
};

const parseRecapBannerState = (rawValue: string | null): RecapBannerState => {
  if (!rawValue) {
    return EMPTY_RECAP_BANNER_STATE;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return EMPTY_RECAP_BANNER_STATE;
    }

    const source = parsed as Record<string, unknown>;
    return {
      seenRecapIds: asRecapIdList(source.seenRecapIds),
      dismissedRecapIds: asRecapIdList(source.dismissedRecapIds),
    };
  } catch {
    return EMPTY_RECAP_BANNER_STATE;
  }
};

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { width: windowWidth } = useWindowDimensions();

  const [hasReviewedUsername, setHasReviewedUsername] = useState<boolean | null>(null);
  const [hasViewedGoals, setHasViewedGoals] = useState<boolean | null>(null);
  const [hasSeenReadyConfirmation, setHasSeenReadyConfirmation] = useState<boolean | null>(null);
  const [recapBannerState, setRecapBannerState] =
    useState<RecapBannerState>(EMPTY_RECAP_BANNER_STATE);
  const [isRecapBannerStateReady, setRecapBannerStateReady] = useState(false);
  const recapBannerStateRef = useRef<RecapBannerState>(EMPTY_RECAP_BANNER_STATE);
  const hasRecapBannerStateHydratedRef = useRef(false);
  const isRecapBannerStateDirtyRef = useRef(false);

  useEffect(() => {
    let isActive = true;

    if (!userId) {
      setHasReviewedUsername(true);
      setHasViewedGoals(true);
      setHasSeenReadyConfirmation(true);
      return () => {
        isActive = false;
      };
    }

    setHasReviewedUsername(null);
    setHasViewedGoals(null);
    setHasSeenReadyConfirmation(null);

    Promise.all([
      readProfileGuidanceFlag(usernameReviewedStorageKey(userId)),
      readProfileGuidanceFlag(goalsViewedStorageKey(userId)),
      readProfileGuidanceFlag(readyConfirmationSeenStorageKey(userId)),
    ])
      .then(([usernameReviewed, goalsViewed, readyConfirmationSeen]) => {
        if (isActive) {
          setHasReviewedUsername(usernameReviewed ?? false);
          setHasViewedGoals(goalsViewed ?? false);
          setHasSeenReadyConfirmation(readyConfirmationSeen ?? false);
        }
      })
      .catch(() => {
        if (isActive) {
          setHasReviewedUsername(false);
          setHasViewedGoals(false);
          setHasSeenReadyConfirmation(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      if (!userId) {
        setHasReviewedUsername(true);
        setHasViewedGoals(true);
        setHasSeenReadyConfirmation(true);
        return () => {
          isActive = false;
        };
      }

      Promise.all([
        readProfileGuidanceFlag(usernameReviewedStorageKey(userId)),
        readProfileGuidanceFlag(goalsViewedStorageKey(userId)),
        readProfileGuidanceFlag(readyConfirmationSeenStorageKey(userId)),
      ])
        .then(([usernameReviewed, goalsViewed, readyConfirmationSeen]) => {
          if (isActive) {
            setHasReviewedUsername(usernameReviewed ?? false);
            setHasViewedGoals(goalsViewed ?? false);
            setHasSeenReadyConfirmation(readyConfirmationSeen ?? false);
          }
        })
        .catch(() => undefined);

      return () => {
        isActive = false;
      };
    }, [userId]),
  );

  useEffect(() => {
    recapBannerStateRef.current = recapBannerState;
  }, [recapBannerState]);

  useEffect(() => {
    let isActive = true;

    if (!userId) {
      setRecapBannerState(EMPTY_RECAP_BANNER_STATE);
      recapBannerStateRef.current = EMPTY_RECAP_BANNER_STATE;
      hasRecapBannerStateHydratedRef.current = false;
      isRecapBannerStateDirtyRef.current = false;
      setRecapBannerStateReady(false);
      return () => {
        isActive = false;
      };
    }

    hasRecapBannerStateHydratedRef.current = false;
    isRecapBannerStateDirtyRef.current = false;
    setRecapBannerStateReady(false);

    AsyncStorage.getItem(recapBannerStateKey(userId))
      .then((storedValue) => {
        if (!isActive) {
          return;
        }

        const parsedState = parseRecapBannerState(storedValue);
        recapBannerStateRef.current = parsedState;
        setRecapBannerState(parsedState);
      })
      .catch(() => {
        if (isActive) {
          setRecapBannerState(EMPTY_RECAP_BANNER_STATE);
          recapBannerStateRef.current = EMPTY_RECAP_BANNER_STATE;
        }
      })
      .finally(() => {
        if (isActive) {
          hasRecapBannerStateHydratedRef.current = true;
          setRecapBannerStateReady(true);
        }
      });

    return () => {
      isActive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (
      !userId ||
      !isRecapBannerStateReady ||
      !hasRecapBannerStateHydratedRef.current ||
      !isRecapBannerStateDirtyRef.current
    ) {
      return;
    }

    isRecapBannerStateDirtyRef.current = false;
    AsyncStorage.setItem(
      recapBannerStateKey(userId),
      JSON.stringify(recapBannerStateRef.current),
    ).catch(() => {
      isRecapBannerStateDirtyRef.current = true;
    });
  }, [isRecapBannerStateReady, recapBannerState, userId]);

  const updateRecapBannerState = useCallback(
    (updater: (current: RecapBannerState) => RecapBannerState) => {
      if (!userId) {
        return;
      }

      const currentState = recapBannerStateRef.current;
      const nextState = updater(currentState);
      if (nextState === currentState) {
        return;
      }

      recapBannerStateRef.current = nextState;
      isRecapBannerStateDirtyRef.current = true;
      setRecapBannerState(nextState);
    },
    [userId],
  );

  useQuery({
    queryKey: userId ? profileQueryKey(userId) : ['profile', 'guest'],
    enabled: Boolean(userId),
    queryFn: () => fetchProfile(userId!),
  });

  const mySuitsQuery = useQuery<FursuitSummary[], Error>({
    queryKey: userId ? mySuitsQueryKey(userId) : ['my-suits', 'guest'],
    enabled: Boolean(userId),
    staleTime: MY_SUITS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchMySuits(userId!),
  });
  const mySuits = useMemo(
    () => mySuitsQuery.data ?? (mySuitsQuery.isError ? undefined : []),
    [mySuitsQuery.data, mySuitsQuery.isError],
  );

  const maxContentWidth = useMemo(() => {
    const safeWidth = Number.isFinite(windowWidth) ? windowWidth : 0;
    const paddedWidth = safeWidth - spacing.lg * 2;
    const contentWidth = paddedWidth > 0 ? paddedWidth : Math.max(safeWidth, 0);
    return Math.min(contentWidth, 960);
  }, [windowWidth]);

  const contentWidthStyle = useMemo(() => ({ width: maxContentWidth }), [maxContentWidth]);

  const isProfileGuidanceReady =
    hasReviewedUsername !== null &&
    hasViewedGoals !== null &&
    hasSeenReadyConfirmation !== null &&
    !mySuitsQuery.isLoading &&
    !mySuitsQuery.isError;
  const profileGuidance = useMemo(
    () =>
      createProfileGuidanceState({
        suits: mySuits ?? [],
        usernameReviewed: hasReviewedUsername === true,
        goalsViewed: hasViewedGoals === true,
      }),
    [hasReviewedUsername, hasViewedGoals, mySuits],
  );
  const shouldShowProfileGuidance =
    Boolean(userId) && isProfileGuidanceReady && !profileGuidance.isComplete;

  useEffect(() => {
    if (
      !userId ||
      !isProfileGuidanceReady ||
      !profileGuidance.isComplete ||
      hasSeenReadyConfirmation
    ) {
      return;
    }

    setHasSeenReadyConfirmation(true);
    showToast("You're ready to play! Go catch a fursuit or check today's goals.");
    void writeProfileGuidanceFlag(readyConfirmationSeenStorageKey(userId)).catch(() => undefined);
  }, [
    hasSeenReadyConfirmation,
    isProfileGuidanceReady,
    profileGuidance.isComplete,
    showToast,
    userId,
  ]);

  const conventionsQuery = useQuery<ConventionSummary[], Error>({
    queryKey: [JOINABLE_CONVENTIONS_QUERY_KEY],
    enabled: Boolean(userId),
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchJoinableConventions(),
  });
  const {
    data: conventions = [],
    error: conventionsError,
    refetch: refetchConventions,
  } = conventionsQuery;

  const profileConventionsQuery = useQuery<string[], Error>({
    queryKey: [ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY, userId],
    enabled: Boolean(userId),
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchActiveProfileConventionIds(userId!),
  });
  const {
    data: profileConventionIds = [],
    error: profileConventionsError,
    refetch: refetchProfileConventions,
  } = profileConventionsQuery;

  const conventionMembershipsQuery = useQuery<ConventionMembership[], Error>({
    queryKey: [PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY, userId],
    enabled: Boolean(userId),
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: fetchProfileConventionMemberships,
  });
  const { data: conventionMemberships = [] } = conventionMembershipsQuery;

  const pastConventionRecapsQuery = useQuery<PastConventionRecap[], Error>({
    queryKey: [PAST_CONVENTION_RECAPS_QUERY_KEY, userId],
    enabled: Boolean(userId),
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchPastConventionRecaps(),
  });
  const { data: pastConventionRecaps = [] } = pastConventionRecapsQuery;

  const achievementsQueryKey = useMemo(
    () =>
      userId ? achievementsStatusQueryKey(userId) : (['achievements-status', 'guest'] as const),
    [userId],
  );

  const achievementsQuery = useQuery<AchievementWithStatus[], Error>({
    queryKey: achievementsQueryKey,
    enabled: Boolean(userId),
    queryFn: () => fetchAchievementStatus(userId ?? ''),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const {
    data: achievementStatuses = [],
    error: achievementsError,
    refetch: refetchAchievements,
  } = achievementsQuery;

  const unlockedAchievements = useMemo(
    () => achievementStatuses.filter((achievement) => achievement.unlocked),
    [achievementStatuses],
  );

  const achievementsTotal = achievementStatuses.length;
  const achievementsUnlockedCount = unlockedAchievements.length;
  const achievementsProgressPercent =
    achievementsTotal > 0 ? Math.round((achievementsUnlockedCount / achievementsTotal) * 100) : 0;

  const latestUnlockedAchievement = useMemo(() => {
    if (unlockedAchievements.length === 0) {
      return null;
    }

    return [...unlockedAchievements].sort((a, b) => {
      const aTime = a.unlockedAt ? new Date(a.unlockedAt).getTime() : 0;
      const bTime = b.unlockedAt ? new Date(b.unlockedAt).getTime() : 0;
      return bTime - aTime;
    })[0];
  }, [unlockedAchievements]);

  const achievementsErrorMessage = achievementsError?.message ?? null;

  const conventionMap = useMemo(() => {
    return new Map(conventions.map((convention) => [convention.id, convention]));
  }, [conventions]);

  const availableConventions = useMemo(() => {
    return profileConventionIds
      .map((id) => conventionMap.get(id))
      .filter((convention): convention is ConventionSummary => Boolean(convention));
  }, [conventionMap, profileConventionIds]);

  const selectedConvention = useMemo(() => {
    return availableConventions[0] ?? null;
  }, [availableConventions]);
  const selectedConventionId = selectedConvention?.id ?? null;
  const pendingConventionMembership = useMemo(() => {
    return (
      conventionMemberships.find((membership) =>
        ['needs_location_verification', 'awaiting_start', 'upcoming'].includes(
          membership.membership_state,
        ),
      ) ?? null
    );
  }, [conventionMemberships]);
  const noPlayableConventionMessage = useMemo(() => {
    if (!pendingConventionMembership) {
      return 'Join a convention in Settings to use convention features.';
    }

    if (pendingConventionMembership.membership_state === 'needs_location_verification') {
      return `${pendingConventionMembership.name} is live. Verify your location in Settings to start catching.`;
    }

    if (pendingConventionMembership.membership_state === 'awaiting_start') {
      return `${pendingConventionMembership.name} is on your list. Catching opens after staff starts the convention.`;
    }

    return `${pendingConventionMembership.name} is on your list. TailTag will unlock it when the convention starts.`;
  }, [pendingConventionMembership]);

  const dailyTasksQuery = useDailyTasks(userId, selectedConventionId, { suppressToasts: true });
  const {
    data: dailyTasksData,
    error: dailyTasksError,
    refetch: refetchDailyTasks,
    countdown: dailyCountdown,
  } = dailyTasksQuery;

  const dailyTotalTasks = dailyTasksData?.totalCount ?? 0;
  const dailyCompletedTasks = dailyTasksData?.completedCount ?? 0;
  const dailyProgressValue =
    dailyTotalTasks > 0 ? Math.min(dailyCompletedTasks / dailyTotalTasks, 1) : 0;
  const dailyRemainingTasks = Math.max(dailyTotalTasks - dailyCompletedTasks, 0);
  const dailyTasksErrorMessage = dailyTasksError?.message ?? null;
  const hasDailyAssignments = dailyTotalTasks > 0;
  const showDailyError = !dailyTasksData && Boolean(dailyTasksErrorMessage);
  const dailyAllComplete = hasDailyAssignments && dailyRemainingTasks === 0;
  const dailyTimezone = dailyTasksData?.timezone ?? selectedConvention?.timezone ?? 'UTC';
  const dailyResetAtLabel = useMemo(() => {
    if (!dailyTasksData?.resetAt) {
      return null;
    }

    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: dailyTimezone,
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(new Date(dailyTasksData.resetAt));
    } catch (error) {
      console.warn('failed formatting daily reset time', error);
      return null;
    }
  }, [dailyTasksData?.resetAt, dailyTimezone]);

  const leaderboardQuery = useQuery<LeaderboardEntry[], Error>(
    selectedConventionId
      ? createConventionLeaderboardQueryOptions(selectedConventionId)
      : {
          queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, 'idle'],
          queryFn: async () => [],
          enabled: false,
        },
  );
  const {
    data: leaderboardEntries = [],
    error: leaderboardError,
    refetch: refetchLeaderboard,
  } = leaderboardQuery;

  const suitLeaderboardQuery = useQuery<SuitLeaderboardEntry[], Error>(
    selectedConventionId
      ? createConventionSuitLeaderboardQueryOptions(selectedConventionId)
      : {
          queryKey: [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, 'idle'],
          queryFn: async () => [],
          enabled: false,
        },
  );
  const {
    data: suitLeaderboardEntries = [],
    error: suitLeaderboardError,
    refetch: refetchSuitLeaderboard,
  } = suitLeaderboardQuery;

  // Subscribe to realtime changes for leaderboard updates
  useEffect(() => {
    if (!selectedConventionId) return;

    const instanceId = Math.random().toString(36).substring(2, 11);

    // Subscribe to catches - invalidate leaderboard when new catches happen
    const catchesChannel = supabase
      .channel(`leaderboard-catches:${selectedConventionId}:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'catches',
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, selectedConventionId],
          });
          void queryClient.invalidateQueries({
            queryKey: [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, selectedConventionId],
          });
        },
      )
      .subscribe();

    // Subscribe to profile_conventions - invalidate when players join/leave
    const participantsChannel = supabase
      .channel(`leaderboard-participants:${selectedConventionId}:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profile_conventions',
          filter: `convention_id=eq.${selectedConventionId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, selectedConventionId],
          });
        },
      )
      .subscribe();

    // Subscribe to fursuit_conventions - invalidate when fursuits join/leave
    const fursuitsChannel = supabase
      .channel(`leaderboard-fursuits:${selectedConventionId}:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fursuit_conventions',
          filter: `convention_id=eq.${selectedConventionId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, selectedConventionId],
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(catchesChannel);
      void supabase.removeChannel(participantsChannel);
      void supabase.removeChannel(fursuitsChannel);
    };
  }, [selectedConventionId, queryClient]);

  const membershipErrorMessage =
    profileConventionsError?.message ?? conventionsError?.message ?? null;
  const hasConventionAccess = availableConventions.length > 0;

  const rankByProfileId = useMemo(() => {
    return new Map(leaderboardEntries.map((entry, index) => [entry.profileId, index + 1]));
  }, [leaderboardEntries]);

  // Only show players with at least 1 catch
  const entriesWithCatches = leaderboardEntries.filter((entry) => entry.catchCount > 0);
  const topEntries = entriesWithCatches.slice(0, MAX_LEADERBOARD_ENTRIES);
  const selfEntry = userId
    ? (entriesWithCatches.find((entry) => entry.profileId === userId) ?? null)
    : null;

  const isSelfOutsideTop = Boolean(
    selfEntry && !topEntries.some((entry) => entry.profileId === selfEntry.profileId),
  );

  const displayEntries = isSelfOutsideTop && selfEntry ? [...topEntries, selfEntry] : topEntries;

  const topSuitEntries = suitLeaderboardEntries.slice(0, MAX_LEADERBOARD_ENTRIES);
  const suitErrorMessage = suitLeaderboardError?.message ?? null;
  const hasSuitEntries = topSuitEntries.length > 0;
  const seenRecapIdSet = useMemo(() => new Set(recapBannerState.seenRecapIds), [recapBannerState]);
  const dismissedRecapIdSet = useMemo(
    () => new Set(recapBannerState.dismissedRecapIds),
    [recapBannerState],
  );
  const newestUnseenRecap = useMemo(() => {
    if (!userId || !isRecapBannerStateReady) {
      return null;
    }

    return (
      pastConventionRecaps.find(
        (recap) => !seenRecapIdSet.has(recap.recapId) && !dismissedRecapIdSet.has(recap.recapId),
      ) ?? null
    );
  }, [dismissedRecapIdSet, isRecapBannerStateReady, pastConventionRecaps, seenRecapIdSet, userId]);

  const tier1Ready = useAllDataReady([
    conventionsQuery,
    profileConventionsQuery,
    conventionMembershipsQuery,
  ]);
  const rawTier2Ready = useAllDataReady([dailyTasksQuery, achievementsQuery]);
  // When there's no convention, daily tasks won't fire; gate tier 2 on achievements only.
  const tier2Ready =
    tier1Ready &&
    (!selectedConventionId
      ? achievementsQuery.data !== undefined || achievementsQuery.isError
      : rawTier2Ready);
  const tier3Ready = useAllDataReady([leaderboardQuery, suitLeaderboardQuery]);

  useEffect(() => {
    if (!suitLeaderboardEntries.length) return;
    const pixelSize = Math.round(40 * Math.min(PixelRatio.get(), 3));
    const urls = suitLeaderboardEntries
      .slice(0, MAX_LEADERBOARD_ENTRIES)
      .map((e) =>
        getTransformedImageUrl(e.avatarUrl, {
          width: pixelSize,
          height: pixelSize,
        }),
      )
      .filter((url): url is string => url !== null);
    if (urls.length === 0) {
      return;
    }

    const accessToken = session?.access_token ?? null;
    const authenticatedUrls = urls.filter((url) =>
      Boolean(getStorageAuthHeaders(url, accessToken)),
    );
    const publicUrls = urls.filter((url) => !authenticatedUrls.includes(url));

    if (publicUrls.length > 0) {
      void Image.prefetch(publicUrls);
    }

    if (authenticatedUrls.length > 0 && accessToken) {
      void Image.prefetch(authenticatedUrls, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    }
  }, [session?.access_token, suitLeaderboardEntries]);

  const handleReloadStandings = useCallback(() => {
    void refetchLeaderboard({ throwOnError: false });
    void refetchSuitLeaderboard({ throwOnError: false });

    if (!userId || !selectedConventionId) {
      return;
    }

    // Fire-and-forget: don't block UI on event emission
    void emitGameplayEvent({
      type: 'leaderboard_refreshed',
      conventionId: selectedConventionId,
      payload: {
        convention_id: selectedConventionId,
      },
    }).catch((error) => {
      captureHandledException(error, {
        scope: 'home.handleReloadStandings',
        conventionId: selectedConventionId,
      });
    });
    void queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
  }, [refetchLeaderboard, refetchSuitLeaderboard, userId, selectedConventionId, queryClient]);

  const handleViewRecapBanner = useCallback(() => {
    if (!newestUnseenRecap) {
      return;
    }

    const targetRecapId = newestUnseenRecap.recapId;
    updateRecapBannerState((current) => {
      if (current.seenRecapIds.includes(targetRecapId)) {
        return current;
      }

      return {
        ...current,
        seenRecapIds: [...current.seenRecapIds, targetRecapId],
      };
    });

    router.push({
      pathname: '/convention-recaps/[recapId]',
      params: { recapId: targetRecapId },
    });
  }, [newestUnseenRecap, router, updateRecapBannerState]);

  const handleDismissRecapBanner = useCallback(() => {
    if (!newestUnseenRecap) {
      return;
    }

    const targetRecapId = newestUnseenRecap.recapId;
    updateRecapBannerState((current) => {
      if (current.dismissedRecapIds.includes(targetRecapId)) {
        return current;
      }

      return {
        ...current,
        dismissedRecapIds: [...current.dismissedRecapIds, targetRecapId],
      };
    });
  }, [newestUnseenRecap, updateRecapBannerState]);

  const markGoalsViewed = useCallback(async () => {
    if (!userId) {
      return;
    }

    setHasViewedGoals(true);
    await writeProfileGuidanceFlag(goalsViewedStorageKey(userId));
  }, [userId]);

  const handleOpenDailyTasksFromGuidance = useCallback(async () => {
    await markGoalsViewed();
    router.push('/daily-tasks');
  }, [markGoalsViewed, router]);

  const handleOpenAchievementsFromGuidance = useCallback(async () => {
    await markGoalsViewed();
    router.push('/achievements');
  }, [markGoalsViewed, router]);

  const handleProfileGuidanceTaskPress = useCallback(
    (taskId: ProfileGuidanceTaskId) => {
      if (taskId === 'fursuit-profile') {
        if (!mySuits) {
          return;
        }

        if (mySuits.length === 0) {
          router.push('/suits/add-fursuit');
          return;
        }

        const incompleteFursuits = profileGuidance.incompleteFursuits;
        if (incompleteFursuits.length === 1) {
          router.push({
            pathname: '/fursuits/[id]/edit',
            params: { id: incompleteFursuits[0].id },
          });
          return;
        }

        router.push({
          pathname: '/suits',
          params: { guidance: 'fursuit-profile' },
        });
        return;
      }

      if (taskId === 'username') {
        router.push({
          pathname: '/settings',
          params: { focus: 'username' },
        });
        return;
      }

      void handleOpenDailyTasksFromGuidance();
    },
    [handleOpenDailyTasksFromGuidance, mySuits, profileGuidance.incompleteFursuits, router],
  );

  const handleContinueProfileGuidance = useCallback(() => {
    if (!profileGuidance.nextTask) {
      return;
    }

    handleProfileGuidanceTaskPress(profileGuidance.nextTask.id);
  }, [handleProfileGuidanceTaskPress, profileGuidance.nextTask]);

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={['rgba(56,189,248,0.18)', 'rgba(14,165,233,0.1)', 'transparent']}
        style={styles.backgroundGradient}
        pointerEvents="none"
      />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.headerRow, contentWidthStyle]}>
          <Text style={styles.brand}>TailTag</Text>
          <Text style={styles.caption}>Tagging in session</Text>
        </View>

        <View style={[styles.heroBlock, contentWidthStyle]}>
          <Text style={styles.badge}>PRERELEASE</Text>
          <Text style={styles.title}>
            Catch fursuits, grow your collection, and make new furry friends!
          </Text>
          <Text style={styles.subtitle}>
            TailTag makes meeting fursuiters fun! Catch thier fursuit, learn about their likes and
            interests, and start a furry friendship!
          </Text>
          <View style={styles.ctaRow}>
            <TailTagButton
              onPress={() => router.push('/catch')}
              size="lg"
            >
              Catch a fursuit
            </TailTagButton>
            <TailTagButton
              variant="outline"
              onPress={() => router.push('/suits/add-fursuit')}
              size="lg"
            >
              Add your suit
            </TailTagButton>
          </View>
        </View>

        {shouldShowProfileGuidance ? (
          <TailTagCard style={[styles.guidanceCard, contentWidthStyle]}>
            <View style={styles.guidanceHeader}>
              <View style={styles.guidanceTitleBlock}>
                <Text style={styles.sectionEyebrow}>Next steps</Text>
                <Text style={styles.sectionTitle}>Get ready to play!</Text>
                <Text style={styles.guidanceBody}>
                  Finish a few quick steps so people know who you are and what to ask you about.
                </Text>
              </View>
              <View style={styles.guidanceProgressPill}>
                <Text style={styles.guidanceProgressText}>
                  {profileGuidance.completedCount}/{profileGuidance.totalCount}
                </Text>
              </View>
            </View>

            <View style={styles.guidanceTaskList}>
              {profileGuidance.tasks.map((task) => (
                <ProfileGuidanceTaskRow
                  key={task.id}
                  task={task}
                  onPress={() => handleProfileGuidanceTaskPress(task.id)}
                />
              ))}
            </View>

            <View style={styles.guidanceGoalActions}>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={handleOpenDailyTasksFromGuidance}
                style={styles.guidanceGoalButton}
              >
                Daily Tasks
              </TailTagButton>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={handleOpenAchievementsFromGuidance}
                style={styles.guidanceGoalButton}
              >
                Achievements
              </TailTagButton>
            </View>

            <TailTagButton onPress={handleContinueProfileGuidance}>Continue</TailTagButton>
          </TailTagCard>
        ) : null}

        {newestUnseenRecap ? (
          <TailTagCard style={[styles.recapBannerCard, contentWidthStyle]}>
            <View style={styles.recapBannerContent}>
              <View style={styles.recapBannerTextBlock}>
                <Text style={styles.recapBannerTitle}>
                  Your {newestUnseenRecap.conventionName} recap is ready
                </Text>
                <Text style={styles.recapBannerBody}>
                  See your catches, rank, awards, and fursuit stats.
                </Text>
                <View style={styles.recapBannerActionRow}>
                  <TailTagButton
                    size="sm"
                    onPress={handleViewRecapBanner}
                    accessibilityLabel={`View recap for ${newestUnseenRecap.conventionName}`}
                    accessibilityHint="Opens your convention recap details"
                  >
                    View recap
                  </TailTagButton>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Dismiss recap for ${newestUnseenRecap.conventionName}`}
                    accessibilityHint="Hides this recap banner"
                    onPress={handleDismissRecapBanner}
                    style={({ pressed }) => [
                      styles.recapBannerDismissAction,
                      pressed && styles.recapBannerDismissActionPressed,
                    ]}
                  >
                    <Text style={styles.recapBannerDismissText}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </TailTagCard>
        ) : null}

        <TailTagCard style={[styles.dailyCard, contentWidthStyle]}>
          <Text style={styles.sectionEyebrow}>Daily tasks</Text>
          <Text style={styles.sectionTitle}>Today's objectives</Text>

          {!tier1Ready ? (
            <DailyTasksSummarySkeleton />
          ) : !selectedConventionId ? (
            <Text style={styles.message}>{noPlayableConventionMessage}</Text>
          ) : !tier2Ready ? (
            <DailyTasksSummarySkeleton />
          ) : showDailyError ? (
            <View style={styles.helper}>
              <Text style={styles.error}>{dailyTasksErrorMessage}</Text>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={() => {
                  void refetchDailyTasks({ throwOnError: false });
                }}
              >
                Try again
              </TailTagButton>
            </View>
          ) : !hasDailyAssignments ? (
            <Text style={styles.message}>Tasks unlock once today's rotation goes live.</Text>
          ) : (
            <View style={styles.dailySummaryBlock}>
              <View style={styles.dailySummaryHeader}>
                <Text style={styles.dailySummaryText}>
                  {dailyCompletedTasks} / {dailyTotalTasks} complete
                </Text>
                <Text style={styles.dailyCountdown}>Resets in {dailyCountdown}</Text>
              </View>
              <TailTagProgressBar
                value={dailyProgressValue}
                style={styles.dailyProgressBar}
              />
              <Text style={styles.dailySummaryText}>
                {dailyAllComplete
                  ? 'All tasks complete - bonus secured.'
                  : `${dailyRemainingTasks} task${dailyRemainingTasks === 1 ? '' : 's'} remaining`}
              </Text>
              {dailyResetAtLabel ? (
                <Text style={styles.dailyResetLabel}>Next reset at {dailyResetAtLabel}</Text>
              ) : null}
            </View>
          )}

          <TailTagButton
            variant="outline"
            onPress={handleOpenDailyTasksFromGuidance}
            style={styles.dailyCta}
            disabled={!selectedConventionId}
          >
            View daily tasks
          </TailTagButton>
        </TailTagCard>

        <TailTagCard style={[styles.achievementsCard, contentWidthStyle]}>
          <Text style={styles.sectionEyebrow}>Achievements</Text>
          <Text style={styles.sectionTitle}>Track your progress</Text>

          {!tier1Ready || !tier2Ready ? (
            <AchievementsSummarySkeleton />
          ) : achievementsErrorMessage ? (
            <View style={styles.helper}>
              <Text style={styles.error}>{achievementsErrorMessage}</Text>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={() => {
                  void refetchAchievements({ throwOnError: false });
                }}
              >
                Try again
              </TailTagButton>
            </View>
          ) : achievementsTotal === 0 ? (
            <Text style={styles.message}>
              Achievements will appear as soon as the first convention goes live.
            </Text>
          ) : (
            <View style={styles.achievementSummary}>
              <View style={styles.achievementSummaryHeader}>
                <Text style={styles.achievementProgressLabel}>
                  {achievementsUnlockedCount} / {achievementsTotal} unlocked
                </Text>
                <Text style={styles.sectionBody}>{achievementsProgressPercent}% complete</Text>
              </View>
              <View style={styles.achievementProgressBar}>
                <View
                  style={[
                    styles.achievementProgressFill,
                    {
                      width: `${Math.min(Math.max(achievementsProgressPercent, 0), 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.achievementFootnote}>
                {latestUnlockedAchievement
                  ? `Last unlock: ${latestUnlockedAchievement.name}`
                  : 'Catch a suit to unlock your first badge.'}
              </Text>
            </View>
          )}

          <TailTagButton
            variant="outline"
            onPress={handleOpenAchievementsFromGuidance}
            style={styles.achievementCta}
          >
            View achievements
          </TailTagButton>
        </TailTagCard>

        <TailTagCard style={[styles.leaderboardCard, contentWidthStyle]}>
          <Text style={styles.sectionEyebrow}>Leaderboard</Text>
          <Text style={styles.sectionTitle}>Catch standings</Text>

          {!tier1Ready ? (
            <View style={styles.leaderboardContent}>
              <LeaderboardSectionSkeleton />
              <View style={styles.leaderboardDivider} />
              <LeaderboardSectionSkeleton />
            </View>
          ) : membershipErrorMessage ? (
            <View style={styles.helper}>
              <Text style={styles.error}>{membershipErrorMessage}</Text>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={() => {
                  void refetchProfileConventions({ throwOnError: false });
                  void refetchConventions({ throwOnError: false });
                }}
              >
                Try again
              </TailTagButton>
            </View>
          ) : hasConventionAccess ? (
            <View style={styles.leaderboardContent}>
              <Text style={styles.sectionBody}>
                Showing top taggers for {selectedConvention?.name ?? 'your convention'}.
              </Text>

              {selectedConventionId ? (
                <View style={styles.leaderboardStack}>
                  <View>
                    {!tier3Ready ? (
                      <LeaderboardSectionSkeleton />
                    ) : leaderboardError ? (
                      <View style={styles.helper}>
                        <Text style={styles.error}>{leaderboardError.message}</Text>
                        <TailTagButton
                          variant="outline"
                          size="sm"
                          onPress={() => {
                            void refetchLeaderboard({ throwOnError: false });
                          }}
                        >
                          Try again
                        </TailTagButton>
                      </View>
                    ) : displayEntries.length > 0 ? (
                      <View style={styles.leaderboardSection}>
                        <View style={styles.leaderboardList}>
                          {displayEntries.map((entry) => {
                            const rank = rankByProfileId.get(entry.profileId) ?? 0;
                            const isSelf = entry.profileId === userId;

                            return (
                              <Pressable
                                key={`${entry.profileId}-${rank}`}
                                style={({ pressed }) => [
                                  styles.leaderboardRow,
                                  isSelf && styles.leaderboardRowHighlight,
                                  pressed && styles.leaderboardRowPressed,
                                ]}
                                onPress={() =>
                                  router.push({
                                    pathname: '/profile/[id]',
                                    params: { id: entry.profileId },
                                  })
                                }
                              >
                                <Text style={styles.leaderboardRank}>#{rank}</Text>
                                <View style={styles.leaderboardDetails}>
                                  <Text
                                    style={styles.leaderboardName}
                                    numberOfLines={1}
                                  >
                                    {entry.username ?? 'Unnamed player'}
                                  </Text>
                                  <Text
                                    style={styles.leaderboardCatchLabel}
                                    numberOfLines={1}
                                  >
                                    {formatCatchCount(entry.catchCount)}
                                    {isSelf ? ' · You' : ''}
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                        {isSelfOutsideTop && selfEntry ? (
                          <Text style={styles.leaderboardFootnote}>
                            You're currently #{rankByProfileId.get(selfEntry.profileId)}. Keep
                            hunting to climb the board.
                          </Text>
                        ) : null}
                        <Pressable
                          style={({ pressed }) => [
                            styles.seeAllLink,
                            pressed && styles.seeAllLinkPressed,
                          ]}
                          onPress={() =>
                            router.push({
                              pathname: '/leaderboard/[conventionId]',
                              params: {
                                conventionId: selectedConventionId!,
                                conventionName: selectedConvention?.name ?? '',
                                section: 'catchers',
                              },
                            })
                          }
                        >
                          <Text style={styles.seeAllText}>See all catchers</Text>
                          <Text style={styles.seeAllArrow}>→</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={styles.message}>
                        No catches yet. Be the first to tag a suit at this convention.
                      </Text>
                    )}
                  </View>

                  <View style={styles.leaderboardDivider} />

                  <View style={styles.suitLeaderboardSection}>
                    <Text style={styles.sectionSubheading}>Top fursuits</Text>
                    {!tier3Ready ? (
                      <LeaderboardSectionSkeleton />
                    ) : suitErrorMessage ? (
                      <View style={styles.helper}>
                        <Text style={styles.error}>{suitErrorMessage}</Text>
                        <TailTagButton
                          variant="outline"
                          size="sm"
                          onPress={() => {
                            void refetchSuitLeaderboard({
                              throwOnError: false,
                            });
                          }}
                        >
                          Try again
                        </TailTagButton>
                      </View>
                    ) : hasSuitEntries ? (
                      <View style={styles.leaderboardSection}>
                        <View style={styles.leaderboardList}>
                          {topSuitEntries.map((entry, index) => (
                            <Pressable
                              key={entry.fursuitId}
                              style={({ pressed }) => [
                                styles.leaderboardRow,
                                pressed && styles.leaderboardRowPressed,
                              ]}
                              onPress={() =>
                                router.push({
                                  pathname: '/fursuits/[id]',
                                  params: { id: entry.fursuitId },
                                })
                              }
                              accessibilityRole="button"
                              accessibilityLabel={`View ${entry.name}'s fursuit profile`}
                            >
                              <Text style={styles.leaderboardRank}>#{index + 1}</Text>
                              <AppAvatar
                                url={entry.avatarUrl}
                                size="xs"
                                fallback="fursuit"
                                style={styles.avatarMargin}
                              />
                              <View style={styles.leaderboardDetails}>
                                <Text
                                  style={styles.leaderboardName}
                                  numberOfLines={1}
                                >
                                  {entry.name}
                                </Text>
                                <Text
                                  style={styles.leaderboardCatchLabel}
                                  numberOfLines={1}
                                >
                                  {formatCatchCount(entry.catchCount)}
                                </Text>
                              </View>
                            </Pressable>
                          ))}
                        </View>
                        <Pressable
                          style={({ pressed }) => [
                            styles.seeAllLink,
                            pressed && styles.seeAllLinkPressed,
                          ]}
                          onPress={() =>
                            router.push({
                              pathname: '/leaderboard/[conventionId]',
                              params: {
                                conventionId: selectedConventionId!,
                                conventionName: selectedConvention?.name ?? '',
                                section: 'suits',
                              },
                            })
                          }
                        >
                          <Text style={styles.seeAllText}>See all suits</Text>
                          <Text style={styles.seeAllArrow}>→</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={styles.message}>No fursuits have been caught yet.</Text>
                    )}
                  </View>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.helper}>
              <Text style={styles.message}>{noPlayableConventionMessage}</Text>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={() => router.push('/settings')}
              >
                Manage conventions
              </TailTagButton>
            </View>
          )}

          <TailTagButton
            variant="outline"
            onPress={handleReloadStandings}
            style={styles.leaderboardCta}
            disabled={!selectedConventionId}
          >
            Reload standings
          </TailTagButton>
        </TailTagCard>

        <TailTagCard style={[styles.loopCard, contentWidthStyle]}>
          <Text style={styles.sectionEyebrow}>How to Play</Text>
          <Text style={styles.sectionTitle}>Four quick steps</Text>
          <View>
            {[
              {
                step: '1',
                title: 'Add your fursuit (if you have one)',
                description: 'Each fursuit gets an auto-generated catch code to share.',
              },
              {
                step: '2',
                title: 'Start catching fursuiters',
                description:
                  'Tag fursuits with a selfie or catch code and watch your collection grow.',
              },
              {
                step: '3',
                title: 'Complete tasks & earn achievements',
                description:
                  'Tackle daily challenges at conventions and unlock achievements along the way.',
              },
              {
                step: '4',
                title: 'Meet new furry friends',
                description: 'Connect with cool new fursuiters while you play!',
              },
            ].map((item, index, array) => (
              <View
                style={[styles.stepRow, index < array.length - 1 && styles.stepRowSpacing]}
                key={item.step}
              >
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>{item.step}</Text>
                </View>
                <View style={styles.stepDetails}>
                  <Text style={styles.stepTitle}>{item.title}</Text>
                  <Text style={styles.stepDescription}>{item.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </TailTagCard>
      </ScrollView>
    </View>
  );
}

function ProfileGuidanceTaskRow({
  task,
  onPress,
}: {
  task: ProfileGuidanceTask;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={task.title}
      accessibilityHint={task.description}
      onPress={onPress}
      style={({ pressed }) => [
        styles.guidanceTaskRow,
        task.isComplete ? styles.guidanceTaskRowComplete : null,
        pressed ? styles.guidanceTaskRowPressed : null,
      ]}
    >
      <Ionicons
        name={task.isComplete ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={task.isComplete ? '#4ade80' : colors.primary}
      />
      <View style={styles.guidanceTaskTextBlock}>
        <Text style={styles.guidanceTaskTitle}>{task.title}</Text>
        <Text style={styles.guidanceTaskDescription}>{task.description}</Text>
      </View>
      {!task.isComplete ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color="rgba(203,213,225,0.7)"
        />
      ) : null}
    </Pressable>
  );
}
