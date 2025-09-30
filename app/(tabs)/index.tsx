import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { useAuth } from '../../src/features/auth';
import {
  CONVENTIONS_QUERY_KEY,
  CONVENTIONS_STALE_TIME,
  type ConventionSummary,
  fetchConventions,
  fetchProfileConventionIds,
  PROFILE_CONVENTIONS_QUERY_KEY,
} from '../../src/features/conventions';
import {
  CONVENTION_LEADERBOARD_QUERY_KEY,
  CONVENTION_SUIT_LEADERBOARD_QUERY_KEY,
  fetchConventionLeaderboard,
  fetchConventionSuitLeaderboard,
  type LeaderboardEntry,
  type SuitLeaderboardEntry,
} from '../../src/features/leaderboard';
import {
  fetchAchievementStatus,
  achievementsStatusQueryKey,
  useAchievementsRealtime,
  type AchievementWithStatus,
} from '../../src/features/achievements';
import { colors, spacing, radius } from '../../src/theme';

const features = [
  {
    title: 'Mobile-first dashboard',
    description:
      'Cards, buttons, and inputs are tuned for thumbs—no pinching or zooming required.',
  },
  {
    title: 'Fast email login',
    description: 'Secure email sign-in keeps your progress ready on any device.',
  },
  {
    title: 'Ready for the floor',
    description:
      'Install TailTag on your phone and keep tagging even when the hotel Wi-Fi is spotty.',
  },
];

const MAX_LEADERBOARD_ENTRIES = 10;

const formatCatchCount = (count: number) => (count === 1 ? '1 catch' : `${count} catches`);

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

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
    () => (userId ? achievementsStatusQueryKey(userId) : ['achievements-status', 'guest'] as const),
    [userId]
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
    queryFn: () => fetchAchievementStatus(userId ?? ''),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const unlockedAchievements = useMemo(
    () => achievementStatuses.filter((achievement) => achievement.unlocked),
    [achievementStatuses]
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

  const handleAchievementUnlocked = useCallback((achievement: AchievementWithStatus) => {
    Alert.alert('Achievement unlocked!', achievement.name);
  }, []);

  useAchievementsRealtime(userId, { onUnlocked: handleAchievementUnlocked });

  const conventionMap = useMemo(() => {
    return new Map(conventions.map((convention) => [convention.id, convention]));
  }, [conventions]);

  const availableConventions = useMemo(() => {
    return profileConventionIds
      .map((id) => conventionMap.get(id))
      .filter((convention): convention is ConventionSummary => Boolean(convention));
  }, [conventionMap, profileConventionIds]);

  const [selectedConventionId, setSelectedConventionId] = useState<string | null>(null);

  useEffect(() => {
    if (availableConventions.length === 0) {
      setSelectedConventionId(null);
      return;
    }

    setSelectedConventionId((current) => {
      if (current && availableConventions.some((convention) => convention.id === current)) {
        return current;
      }

      return availableConventions[0]?.id ?? null;
    });
  }, [availableConventions]);

  const {
    data: leaderboardEntries = [],
    error: leaderboardError,
    isLoading: isLeaderboardLoading,
    isFetching: isLeaderboardFetching,
    refetch: refetchLeaderboard,
  } = useQuery<LeaderboardEntry[], Error>({
    queryKey: selectedConventionId
      ? [CONVENTION_LEADERBOARD_QUERY_KEY, selectedConventionId]
      : [CONVENTION_LEADERBOARD_QUERY_KEY, 'idle'],
    queryFn: selectedConventionId
      ? () => fetchConventionLeaderboard(selectedConventionId)
      : async () => [],
    enabled: Boolean(userId && selectedConventionId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const {
    data: suitLeaderboardEntries = [],
    error: suitLeaderboardError,
    isLoading: isSuitLeaderboardLoading,
    isFetching: isSuitLeaderboardFetching,
    refetch: refetchSuitLeaderboard,
  } = useQuery<SuitLeaderboardEntry[], Error>({
    queryKey: selectedConventionId
      ? [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, selectedConventionId]
      : [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, 'idle'],
    queryFn: selectedConventionId
      ? () => fetchConventionSuitLeaderboard(selectedConventionId)
      : async () => [],
    enabled: Boolean(userId && selectedConventionId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const membershipErrorMessage = profileConventionsError?.message ?? conventionsError?.message ?? null;
  const isMembershipLoading = isProfileConventionsLoading || isConventionsLoading;
  const hasConventionAccess = availableConventions.length > 0;
  const isLeaderboardBusy = isLeaderboardLoading || isLeaderboardFetching;

  const rankByProfileId = useMemo(() => {
    return new Map(leaderboardEntries.map((entry, index) => [entry.profileId, index + 1]));
  }, [leaderboardEntries]);

  const topEntries = leaderboardEntries.slice(0, MAX_LEADERBOARD_ENTRIES);
  const selfEntry = userId
    ? leaderboardEntries.find((entry) => entry.profileId === userId) ?? null
    : null;

  const isSelfOutsideTop = Boolean(
    selfEntry && !topEntries.some((entry) => entry.profileId === selfEntry.profileId)
  );

  const displayEntries = isSelfOutsideTop && selfEntry ? [...topEntries, selfEntry] : topEntries;

  const topSuitEntries = suitLeaderboardEntries.slice(0, MAX_LEADERBOARD_ENTRIES);
  const isSuitLeaderboardBusy = isSuitLeaderboardLoading || isSuitLeaderboardFetching;
  const suitErrorMessage = suitLeaderboardError?.message ?? null;
  const hasSuitEntries = topSuitEntries.length > 0;

  const describeSuitEntry = (entry: SuitLeaderboardEntry) => {
    const pieces = [formatCatchCount(entry.catchCount)];

    if (entry.species) {
      pieces.push(entry.species);
    }

    if (entry.ownerUsername) {
      pieces.push(`Owner: ${entry.ownerUsername}`);
    }

    return pieces.join(' · ');
  };

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={['rgba(56,189,248,0.18)', 'rgba(14,165,233,0.1)', 'transparent']}
        style={styles.backgroundGradient}
        pointerEvents="none"
      />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.brand}>TailTag</Text>
          <Text style={styles.caption}>Trading in session</Text>
        </View>

        <View style={styles.heroBlock}>
          <Text style={styles.badge}>MVP Preview</Text>
          <Text style={styles.title}>
            Catch fursuits, grow your collection, and keep the con energy going.
          </Text>
          <Text style={styles.subtitle}>
            TailTag makes swapping bespoke suit codes effortless. Add your suits, trade tags on the floor, and watch your collection grow from your phone.
          </Text>
          <View style={styles.ctaRow}>
            <View style={styles.ctaItem}>
              <TailTagButton onPress={() => router.push('/catch')} size="lg">
                Catch a suit
              </TailTagButton>
            </View>
            <View style={styles.ctaItem}>
              <TailTagButton
                variant="outline"
                onPress={() => router.push('/suits/add-fursuit')}
                size="lg"
              >
                Add your suit
              </TailTagButton>
            </View>
          </View>
        </View>

        <TailTagCard style={styles.achievementsCard}>
          <Text style={styles.sectionEyebrow}>Achievements</Text>
          <Text style={styles.sectionTitle}>Keep the streak going</Text>

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
                      width: `${Math.min(
                        Math.max(achievementsProgressPercent, 0),
                        100
                      )}%`,
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
            onPress={() => router.push('/achievements')}
            style={styles.achievementCta}
          >
            View achievements
          </TailTagButton>
        </TailTagCard>

        <TailTagCard style={styles.leaderboardCard}>
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
              <Text style={styles.sectionBody}>Pick a convention to see the top hunters.</Text>
              <View style={styles.selectorRow}>
                {availableConventions.map((convention) => (
                  <TailTagButton
                    key={convention.id}
                    size="sm"
                    variant={selectedConventionId === convention.id ? 'primary' : 'outline'}
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
                              <View
                                key={`${entry.profileId}-${rank}`}
                                style={[
                                  styles.leaderboardRow,
                                  isSelf && styles.leaderboardRowHighlight,
                                ]}
                              >
                                <Text style={styles.leaderboardRank}>#{rank}</Text>
                                <View style={styles.leaderboardDetails}>
                                  <Text style={styles.leaderboardName} numberOfLines={1}>
                                    {entry.username ?? 'Unnamed player'}
                                  </Text>
                                  <Text style={styles.leaderboardCatchLabel} numberOfLines={1}>
                                    {formatCatchCount(entry.catchCount)}
                                    {isSelf ? ' · You' : ''}
                                  </Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                        {isSelfOutsideTop && selfEntry ? (
                          <Text style={styles.leaderboardFootnote}>
                            You're currently #{rankByProfileId.get(selfEntry.profileId)}. Keep hunting to climb the board.
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <Text style={styles.message}>
                        No catches yet. Be the first to tag a suit at this convention.
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
                            void refetchSuitLeaderboard({ throwOnError: false });
                          }}
                        >
                          Try again
                        </TailTagButton>
                      </View>
                    ) : hasSuitEntries ? (
                      <View style={styles.leaderboardList}>
                        {topSuitEntries.map((entry, index) => (
                          <View key={entry.fursuitId} style={styles.leaderboardRow}>
                            <Text style={styles.leaderboardRank}>#{index + 1}</Text>
                            <View style={styles.leaderboardDetails}>
                              <Text style={styles.leaderboardName} numberOfLines={1}>
                                {entry.name}
                              </Text>
                              <Text style={styles.leaderboardCatchLabel} numberOfLines={1}>
                                {describeSuitEntry(entry)}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.message}>No suit catches recorded yet.</Text>
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
                onPress={() => router.push('/settings')}
              >
                Manage conventions
              </TailTagButton>
            </View>
          )}
        </TailTagCard>

        <TailTagCard style={styles.loopCard}>
          <Text style={styles.sectionEyebrow}>Gameplay Loop</Text>
          <Text style={styles.sectionTitle}>Four quick steps</Text>
          <View>
            {[
              {
                step: '1',
                title: 'Register',
                description: 'Create your TailTag profile in seconds with email login.',
              },
              {
                step: '2',
                title: 'Add suits',
                description: 'Give each fursuit a name, species, and a unique catch code.',
              },
              {
                step: '3',
                title: 'Trade tags',
                description: 'Swap codes with other players out at a convention.',
              },
              {
                step: '4',
                title: 'Log catches',
                description: 'Record new catches instantly and watch your collection fill out.',
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

        <View style={styles.featureGrid}>
          {features.map((feature) => (
            <TailTagCard key={feature.title} style={styles.featureCard}>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureDescription}>{feature.description}</Text>
            </TailTagCard>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const { width } = Dimensions.get('window');
const maxContentWidth = Math.min(width - spacing.lg * 2, 960);

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backgroundGradient: {
    position: 'absolute',
    top: -120,
    left: -60,
    right: -60,
    height: 320,
    borderRadius: 240,
    opacity: 0.6,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.xxl,
    alignItems: 'center',
  },
  headerRow: {
    width: maxContentWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  brand: {
    color: '#38bdf8',
    fontSize: 20,
    fontWeight: '700',
  },
  caption: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  heroBlock: {
    width: maxContentWidth,
    marginBottom: spacing.xl,
  },
  achievementsCard: {
    width: maxContentWidth,
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  achievementSummary: {
    gap: spacing.sm,
  },
  achievementSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  achievementProgressLabel: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
  },
  achievementProgressBar: {
    height: 8,
    width: '100%',
    borderRadius: radius.md,
    backgroundColor: 'rgba(148,163,184,0.25)',
    overflow: 'hidden',
  },
  achievementProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  achievementFootnote: {
    color: 'rgba(203,213,225,0.75)',
    fontSize: 13,
  },
  achievementCta: {
    alignSelf: 'flex-start',
  },
  badge: {
    alignSelf: 'flex-start',
    color: '#bae6fd',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.4)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 32,
    color: colors.foreground,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(203,213,225,0.9)',
    marginBottom: spacing.lg,
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  ctaItem: {
    marginRight: spacing.md,
    marginBottom: spacing.md,
  },
  leaderboardCard: {
    width: maxContentWidth,
    marginBottom: spacing.xl,
  },
  loopCard: {
    width: maxContentWidth,
    marginBottom: spacing.xl,
  },
  sectionEyebrow: {
    fontSize: 12,
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  sectionSubheading: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  sectionBody: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
    marginBottom: spacing.md,
  },
  message: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  helper: {
    gap: spacing.sm,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
  },
  leaderboardContent: {
    gap: spacing.md,
  },
  leaderboardStack: {
    gap: spacing.lg,
  },
  leaderboardDivider: {
    height: 1,
    backgroundColor: 'rgba(148,163,184,0.2)',
    width: '100%',
  },
  leaderboardSection: {
    gap: spacing.sm,
  },
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  selectorButton: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  suitLeaderboardSection: {
    gap: spacing.sm,
  },
  leaderboardList: {
    gap: spacing.xs,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  leaderboardRowHighlight: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'rgba(56,189,248,0.12)',
  },
  leaderboardRank: {
    width: 36,
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  leaderboardDetails: {
    flex: 1,
    gap: 4,
  },
  leaderboardName: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  leaderboardCatchLabel: {
    color: 'rgba(203,213,225,0.8)',
    fontSize: 13,
  },
  leaderboardFootnote: {
    color: 'rgba(203,213,225,0.7)',
    fontSize: 12,
  },
  featureGrid: {
    width: maxContentWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  featureCard: {
    flexBasis: '100%',
    flexGrow: 1,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  featureDescription: {
    fontSize: 15,
    color: 'rgba(203,213,225,0.9)',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepRowSpacing: {
    marginBottom: spacing.md,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(56,189,248,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  stepBadgeText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  stepDetails: {
    flex: 1,
  },
  stepTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  stepDescription: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
});
