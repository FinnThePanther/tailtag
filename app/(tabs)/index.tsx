import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PixelRatio,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Image } from "expo-image";
import { AppAvatar } from "../../src/components/ui/AppAvatar";
import { TailTagButton } from "../../src/components/ui/TailTagButton";
import { TailTagCard } from "../../src/components/ui/TailTagCard";
import { TailTagProgressBar } from "../../src/components/ui/TailTagProgressBar";
import { useAuth } from "../../src/features/auth";
import { fetchProfile, profileQueryKey } from "../../src/features/profile";
import { supabase } from "../../src/lib/supabase";
import { captureHandledException } from "../../src/lib/sentry";
import {
  CONVENTIONS_QUERY_KEY,
  CONVENTIONS_STALE_TIME,
  type ConventionSummary,
  fetchConventions,
  fetchProfileConventionIds,
  PROFILE_CONVENTIONS_QUERY_KEY,
} from "../../src/features/conventions";
import {
  CONVENTION_LEADERBOARD_QUERY_KEY,
  CONVENTION_SUIT_LEADERBOARD_QUERY_KEY,
  createConventionLeaderboardQueryOptions,
  createConventionSuitLeaderboardQueryOptions,
  type LeaderboardEntry,
  type SuitLeaderboardEntry,
} from "../../src/features/leaderboard";
import {
  fetchAchievementStatus,
  achievementsStatusQueryKey,
  type AchievementWithStatus,
} from "../../src/features/achievements";
import { emitGameplayEvent } from "../../src/features/events";
import {
  useDailyTasks,
  DAILY_TASKS_QUERY_KEY,
} from "../../src/features/daily-tasks";
import { useAutoRequestPushPermission } from "../../src/features/push-notifications";
import { spacing } from "../../src/theme";
import { getTransformedImageUrl } from "../../src/utils/supabase-image";
import { styles } from "./index.styles";

const MAX_LEADERBOARD_ENTRIES = 5;
const USERNAME_NUDGE_DISMISSED_KEY = "tailtag:username-nudge-dismissed";

const formatCatchCount = (count: number) =>
  count === 1 ? "1 catch" : `${count} catches`;

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const { width: windowWidth } = useWindowDimensions();

  // Auto-request push notification permissions on first visit
  useAutoRequestPushPermission();

  // Username change nudge
  const [nudgeDismissed, setNudgeDismissed] = useState(true);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(USERNAME_NUDGE_DISMISSED_KEY)
      .then((value) => {
        if (mounted && value !== "true") {
          setNudgeDismissed(false);
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const handleDismissNudge = useCallback(() => {
    setNudgeDismissed(true);
    AsyncStorage.setItem(USERNAME_NUDGE_DISMISSED_KEY, "true").catch(
      () => undefined,
    );
  }, []);

  const { data: profile } = useQuery({
    queryKey: userId ? profileQueryKey(userId) : ["profile", "guest"],
    enabled: Boolean(userId) && !nudgeDismissed,
    queryFn: () => fetchProfile(userId!),
  });

  const maxContentWidth = useMemo(() => {
    const safeWidth = Number.isFinite(windowWidth) ? windowWidth : 0;
    const paddedWidth = safeWidth - spacing.lg * 2;
    const contentWidth = paddedWidth > 0 ? paddedWidth : Math.max(safeWidth, 0);
    return Math.min(contentWidth, 960);
  }, [windowWidth]);

  const contentWidthStyle = useMemo(
    () => ({ width: maxContentWidth }),
    [maxContentWidth],
  );

  const {
    data: conventions = [],
    error: conventionsError,
    isLoading: isConventionsLoading,
    refetch: refetchConventions,
  } = useQuery<ConventionSummary[], Error>({
    queryKey: [CONVENTIONS_QUERY_KEY],
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
    queryKey: [PROFILE_CONVENTIONS_QUERY_KEY, userId],
    enabled: Boolean(userId),
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchProfileConventionIds(userId!),
  });

  const achievementsQueryKey = useMemo(
    () =>
      userId
        ? achievementsStatusQueryKey(userId)
        : (["achievements-status", "guest"] as const),
    [userId],
  );

  const {
    data: achievementStatuses = [],
    error: achievementsError,
    isLoading: isAchievementsLoading,
    isFetching: isAchievementsFetching,
    refetch: refetchAchievements,
  } = useQuery<AchievementWithStatus[], Error>({
    queryKey: achievementsQueryKey,
    enabled: Boolean(userId),
    queryFn: () => fetchAchievementStatus(userId ?? ""),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const unlockedAchievements = useMemo(
    () => achievementStatuses.filter((achievement) => achievement.unlocked),
    [achievementStatuses],
  );

  const achievementsTotal = achievementStatuses.length;
  const achievementsUnlockedCount = unlockedAchievements.length;
  const achievementsProgressPercent =
    achievementsTotal > 0
      ? Math.round((achievementsUnlockedCount / achievementsTotal) * 100)
      : 0;

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
  const isAchievementsBusy = isAchievementsLoading || isAchievementsFetching;

  const conventionMap = useMemo(() => {
    return new Map(
      conventions.map((convention) => [convention.id, convention]),
    );
  }, [conventions]);

  const availableConventions = useMemo(() => {
    return profileConventionIds
      .map((id) => conventionMap.get(id))
      .filter((convention): convention is ConventionSummary =>
        Boolean(convention),
      );
  }, [conventionMap, profileConventionIds]);

  const [selectedConventionId, setSelectedConventionId] = useState<
    string | null
  >(null);

  useEffect(() => {
    setSelectedConventionId((current) => {
      if (availableConventions.length === 0) {
        return null;
      }

      if (
        current &&
        availableConventions.some((convention) => convention.id === current)
      ) {
        return current;
      }

      return availableConventions[0]?.id ?? null;
    });
  }, [availableConventions]);

  const selectedConvention = useMemo(() => {
    if (!selectedConventionId) {
      return null;
    }
    return (
      availableConventions.find(
        (convention) => convention.id === selectedConventionId,
      ) ?? null
    );
  }, [availableConventions, selectedConventionId]);

  const {
    data: dailyTasksData,
    error: dailyTasksError,
    isLoading: isDailyTasksLoading,
    refetch: refetchDailyTasks,
    countdown: dailyCountdown,
  } = useDailyTasks(userId, selectedConventionId, { suppressToasts: true });

  const dailyTotalTasks = dailyTasksData?.totalCount ?? 0;
  const dailyCompletedTasks = dailyTasksData?.completedCount ?? 0;
  const dailyProgressValue =
    dailyTotalTasks > 0
      ? Math.min(dailyCompletedTasks / dailyTotalTasks, 1)
      : 0;
  const dailyRemainingTasks = Math.max(
    dailyTotalTasks - dailyCompletedTasks,
    0,
  );
  const dailyTasksErrorMessage = dailyTasksError?.message ?? null;
  const hasDailyAssignments = dailyTotalTasks > 0;
  const showDailySkeleton = !dailyTasksData && isDailyTasksLoading;
  const showDailyError = !dailyTasksData && Boolean(dailyTasksErrorMessage);
  const dailyAllComplete = hasDailyAssignments && dailyRemainingTasks === 0;
  const dailyTimezone =
    dailyTasksData?.timezone ?? selectedConvention?.timezone ?? "UTC";
  const dailyResetAtLabel = useMemo(() => {
    if (!dailyTasksData?.resetAt) {
      return null;
    }

    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: dailyTimezone,
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(dailyTasksData.resetAt));
    } catch (error) {
      console.warn("failed formatting daily reset time", error);
      return null;
    }
  }, [dailyTasksData?.resetAt, dailyTimezone]);

  const {
    data: leaderboardEntries = [],
    error: leaderboardError,
    isLoading: isLeaderboardLoading,
    isFetching: isLeaderboardFetching,
    refetch: refetchLeaderboard,
  } = useQuery<LeaderboardEntry[], Error>(
    selectedConventionId
      ? createConventionLeaderboardQueryOptions(selectedConventionId)
      : {
          queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, "idle"],
          queryFn: async () => [],
          enabled: false,
        },
  );

  const {
    data: suitLeaderboardEntries = [],
    error: suitLeaderboardError,
    isLoading: isSuitLeaderboardLoading,
    isFetching: isSuitLeaderboardFetching,
    refetch: refetchSuitLeaderboard,
  } = useQuery<SuitLeaderboardEntry[], Error>(
    selectedConventionId
      ? createConventionSuitLeaderboardQueryOptions(selectedConventionId)
      : {
          queryKey: [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, "idle"],
          queryFn: async () => [],
          enabled: false,
        },
  );

  // Subscribe to realtime changes for leaderboard updates
  useEffect(() => {
    if (!selectedConventionId) return;

    const instanceId = Math.random().toString(36).substring(2, 11);

    // Subscribe to catches - invalidate leaderboard when new catches happen
    const catchesChannel = supabase
      .channel(`leaderboard-catches:${selectedConventionId}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "catches",
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, selectedConventionId],
          });
          void queryClient.invalidateQueries({
            queryKey: [
              CONVENTION_SUIT_LEADERBOARD_QUERY_KEY,
              selectedConventionId,
            ],
          });
        },
      )
      .subscribe();

    // Subscribe to profile_conventions - invalidate when players join/leave
    const participantsChannel = supabase
      .channel(`leaderboard-participants:${selectedConventionId}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profile_conventions",
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
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fursuit_conventions",
          filter: `convention_id=eq.${selectedConventionId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: [
              CONVENTION_SUIT_LEADERBOARD_QUERY_KEY,
              selectedConventionId,
            ],
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
  const isMembershipLoading =
    isProfileConventionsLoading || isConventionsLoading;
  const hasConventionAccess = availableConventions.length > 0;
  const isLeaderboardBusy = isLeaderboardLoading || isLeaderboardFetching;

  const rankByProfileId = useMemo(() => {
    return new Map(
      leaderboardEntries.map((entry, index) => [entry.profileId, index + 1]),
    );
  }, [leaderboardEntries]);

  // Only show players with at least 1 catch
  const entriesWithCatches = leaderboardEntries.filter(
    (entry) => entry.catchCount > 0,
  );
  const topEntries = entriesWithCatches.slice(0, MAX_LEADERBOARD_ENTRIES);
  const selfEntry = userId
    ? (entriesWithCatches.find((entry) => entry.profileId === userId) ?? null)
    : null;

  const isSelfOutsideTop = Boolean(
    selfEntry &&
    !topEntries.some((entry) => entry.profileId === selfEntry.profileId),
  );

  const displayEntries =
    isSelfOutsideTop && selfEntry ? [...topEntries, selfEntry] : topEntries;

  const topSuitEntries = suitLeaderboardEntries.slice(
    0,
    MAX_LEADERBOARD_ENTRIES,
  );
  const isSuitLeaderboardBusy =
    isSuitLeaderboardLoading || isSuitLeaderboardFetching;
  const suitErrorMessage = suitLeaderboardError?.message ?? null;
  const hasSuitEntries = topSuitEntries.length > 0;

  useEffect(() => {
    if (!suitLeaderboardEntries.length) return;
    const pixelSize = Math.round(40 * Math.min(PixelRatio.get(), 3));
    const urls = suitLeaderboardEntries
      .slice(0, MAX_LEADERBOARD_ENTRIES)
      .map((e) => getTransformedImageUrl(e.avatarUrl, { width: pixelSize, height: pixelSize }))
      .filter((url): url is string => url !== null);
    if (urls.length > 0) {
      void Image.prefetch(urls);
    }
  }, [suitLeaderboardEntries]);

  const handleReloadStandings = useCallback(() => {
    void refetchLeaderboard({ throwOnError: false });
    void refetchSuitLeaderboard({ throwOnError: false });

    if (!userId || !selectedConventionId) {
      return;
    }

    // Fire-and-forget: don't block UI on event emission
    void emitGameplayEvent({
      type: "leaderboard_refreshed",
      conventionId: selectedConventionId,
      payload: {
        convention_id: selectedConventionId,
      },
    }).catch((error) => {
      captureHandledException(error, {
        scope: "home.handleReloadStandings",
        conventionId: selectedConventionId,
      });
    });
    void queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
  }, [
    refetchLeaderboard,
    refetchSuitLeaderboard,
    userId,
    selectedConventionId,
    queryClient,
  ]);

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={[
          "rgba(56,189,248,0.18)",
          "rgba(14,165,233,0.1)",
          "transparent",
        ]}
        style={styles.backgroundGradient}
        pointerEvents="none"
      />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.headerRow, contentWidthStyle]}>
          <Text style={styles.brand}>TailTag</Text>
          <Text style={styles.caption}>Tagging in session</Text>
        </View>

        <View style={[styles.heroBlock, contentWidthStyle]}>
          <Text style={styles.badge}>BETA</Text>
          <Text style={styles.title}>
            Catch fursuits, grow your collection, and make new furry friends!
          </Text>
          <Text style={styles.subtitle}>
            TailTag makes meeting fursuiters fun! Collect their codes, learn
            about thier likes and interests, and start a conversation!
          </Text>
          <View style={styles.ctaRow}>
            <TailTagButton onPress={() => router.push("/catch")} size="lg">
              Catch a suit
            </TailTagButton>
            <TailTagButton
              variant="outline"
              onPress={() => router.push("/suits/add-fursuit")}
              size="lg"
            >
              Add your suit
            </TailTagButton>
          </View>
        </View>

        {!nudgeDismissed && session && (
          <TailTagCard style={[styles.nudgeCard, contentWidthStyle]}>
            <View style={styles.nudgeContent}>
              <View style={styles.nudgeTextBlock}>
                <Text style={styles.nudgeText}>
                  Your current username is{" "}
                  <Text style={styles.nudgeUsername}>
                    {profile?.username ?? "..."}
                  </Text>
                  . Want to pick something better?
                </Text>
                <TailTagButton
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    handleDismissNudge();
                    router.push("/settings");
                  }}
                >
                  Change username
                </TailTagButton>
              </View>
              <Pressable
                onPress={handleDismissNudge}
                hitSlop={12}
                style={styles.nudgeDismiss}
              >
                <Ionicons
                  name="close-circle"
                  size={22}
                  color="rgba(148,163,184,0.6)"
                />
              </Pressable>
            </View>
          </TailTagCard>
        )}

        <TailTagCard style={[styles.dailyCard, contentWidthStyle]}>
          <Text style={styles.sectionEyebrow}>Daily tasks</Text>
          <Text style={styles.sectionTitle}>Today's objectives</Text>

          {!selectedConventionId ? (
            <Text style={styles.message}>
              Pick a convention to unlock daily tasks.
            </Text>
          ) : showDailySkeleton ? (
            <Text style={styles.message}>Checking today's lineup...</Text>
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
            <Text style={styles.message}>
              Tasks unlock once today's rotation goes live.
            </Text>
          ) : (
            <View style={styles.dailySummaryBlock}>
              <View style={styles.dailySummaryHeader}>
                <Text style={styles.dailySummaryText}>
                  {dailyCompletedTasks} / {dailyTotalTasks} complete
                </Text>
                <Text style={styles.dailyCountdown}>
                  Resets in {dailyCountdown}
                </Text>
              </View>
              <TailTagProgressBar
                value={dailyProgressValue}
                style={styles.dailyProgressBar}
              />
              <Text style={styles.dailySummaryText}>
                {dailyAllComplete
                  ? "All tasks complete - bonus secured."
                  : `${dailyRemainingTasks} task${
                      dailyRemainingTasks === 1 ? "" : "s"
                    } remaining`}
              </Text>
              {dailyResetAtLabel ? (
                <Text style={styles.dailyResetLabel}>
                  Next reset at {dailyResetAtLabel}
                </Text>
              ) : null}
            </View>
          )}

          <TailTagButton
            variant="outline"
            onPress={() => router.push("/daily-tasks")}
            style={styles.dailyCta}
            disabled={!selectedConventionId}
          >
            View daily tasks
          </TailTagButton>
        </TailTagCard>

        <TailTagCard style={[styles.achievementsCard, contentWidthStyle]}>
          <Text style={styles.sectionEyebrow}>Achievements</Text>
          <Text style={styles.sectionTitle}>Track your progress</Text>

          {isAchievementsBusy ? (
            <Text style={styles.message}>Checking your progress…</Text>
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
              Achievements will appear as soon as the first convention goes
              live.
            </Text>
          ) : (
            <View style={styles.achievementSummary}>
              <View style={styles.achievementSummaryHeader}>
                <Text style={styles.achievementProgressLabel}>
                  {achievementsUnlockedCount} / {achievementsTotal} unlocked
                </Text>
                <Text style={styles.sectionBody}>
                  {achievementsProgressPercent}% complete
                </Text>
              </View>
              <View style={styles.achievementProgressBar}>
                <View
                  style={[
                    styles.achievementProgressFill,
                    {
                      width: `${Math.min(
                        Math.max(achievementsProgressPercent, 0),
                        100,
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.achievementFootnote}>
                {latestUnlockedAchievement
                  ? `Last unlock: ${latestUnlockedAchievement.name}`
                  : "Catch a suit to unlock your first badge."}
              </Text>
            </View>
          )}

          <TailTagButton
            variant="outline"
            onPress={() => router.push("/achievements")}
            style={styles.achievementCta}
          >
            View achievements
          </TailTagButton>
        </TailTagCard>

        <TailTagCard style={[styles.leaderboardCard, contentWidthStyle]}>
          <Text style={styles.sectionEyebrow}>Leaderboard</Text>
          <Text style={styles.sectionTitle}>Catch standings</Text>

          {isMembershipLoading ? (
            <Text style={styles.message}>Loading convention info…</Text>
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
                Pick a convention to see the top hunters.
              </Text>
              <View style={styles.selectorRow}>
                {availableConventions.map((convention) => (
                  <TailTagButton
                    key={convention.id}
                    size="sm"
                    variant={
                      selectedConventionId === convention.id
                        ? "primary"
                        : "outline"
                    }
                    onPress={() => setSelectedConventionId(convention.id)}
                    style={styles.selectorButton}
                  >
                    {convention.name}
                  </TailTagButton>
                ))}
              </View>

              {selectedConventionId ? (
                <View style={styles.leaderboardStack}>
                  <View>
                    {isLeaderboardBusy ? (
                      <Text style={styles.message}>Loading leaderboard…</Text>
                    ) : leaderboardError ? (
                      <View style={styles.helper}>
                        <Text style={styles.error}>
                          {leaderboardError.message}
                        </Text>
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
                            const rank =
                              rankByProfileId.get(entry.profileId) ?? 0;
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
                                    pathname: "/profile/[id]",
                                    params: { id: entry.profileId },
                                  })
                                }
                              >
                                <Text style={styles.leaderboardRank}>
                                  #{rank}
                                </Text>
                                <View style={styles.leaderboardDetails}>
                                  <Text
                                    style={styles.leaderboardName}
                                    numberOfLines={1}
                                  >
                                    {entry.username ?? "Unnamed player"}
                                  </Text>
                                  <Text
                                    style={styles.leaderboardCatchLabel}
                                    numberOfLines={1}
                                  >
                                    {formatCatchCount(entry.catchCount)}
                                    {isSelf ? " · You" : ""}
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                        {isSelfOutsideTop && selfEntry ? (
                          <Text style={styles.leaderboardFootnote}>
                            You're currently #
                            {rankByProfileId.get(selfEntry.profileId)}. Keep
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
                              pathname: "/leaderboard/[conventionId]",
                              params: {
                                conventionId: selectedConventionId!,
                                conventionName: selectedConvention?.name ?? "",
                              },
                            })
                          }
                        >
                          <Text style={styles.seeAllText}>
                            See all catchers
                          </Text>
                          <Text style={styles.seeAllArrow}>→</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={styles.message}>
                        No catches yet. Be the first to tag a suit at this
                        convention.
                      </Text>
                    )}
                  </View>

                  <View style={styles.leaderboardDivider} />

                  <View style={styles.suitLeaderboardSection}>
                    <Text style={styles.sectionSubheading}>Top suits</Text>
                    {isSuitLeaderboardBusy ? (
                      <Text style={styles.message}>Loading suit stats…</Text>
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
                                  pathname: "/fursuits/[id]",
                                  params: { id: entry.fursuitId },
                                })
                              }
                              accessibilityRole="button"
                              accessibilityLabel={`View ${entry.name}'s fursuit profile`}
                            >
                              <Text style={styles.leaderboardRank}>
                                #{index + 1}
                              </Text>
                              <AppAvatar url={entry.avatarUrl} size="xs" fallback="fursuit" style={styles.avatarMargin} />
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
                              pathname: "/leaderboard/[conventionId]",
                              params: {
                                conventionId: selectedConventionId!,
                                conventionName: selectedConvention?.name ?? "",
                              },
                            })
                          }
                        >
                          <Text style={styles.seeAllText}>See all suits</Text>
                          <Text style={styles.seeAllArrow}>→</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={styles.message}>
                        No suit catches recorded yet.
                      </Text>
                    )}
                  </View>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.helper}>
              <Text style={styles.message}>
                Opt into a convention to see its leaderboard standings.
              </Text>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={() => router.push("/settings")}
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
                step: "1",
                title: "Add your fursuit (if you have one)",
                description: "Each gets an auto-generated catch code to share.",
              },
              {
                step: "2",
                title: "Log catches",
                description:
                  "Catch fursuiters with their codes and watch your collection grow.",
              },
              {
                step: "3",
                title: "Complete tasks & earn achievements",
                description:
                  "Tackle daily challenges at conventions and unlock achievements along the way.",
              },
              {
                step: "4",
                title: "Meet fursuiters",
                description: "Connect with cool new fursuiters while you play!",
              },
            ].map((item, index, array) => (
              <View
                style={[
                  styles.stepRow,
                  index < array.length - 1 && styles.stepRowSpacing,
                ]}
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
