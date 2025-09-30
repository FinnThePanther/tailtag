import { useCallback, useMemo } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { useAuth } from '../../src/features/auth';
import {
  achievementsStatusQueryKey,
  fetchAchievementStatus,
  type AchievementWithStatus,
  useAchievementsRealtime,
} from '../../src/features/achievements';
import { colors, radius, spacing } from '../../src/theme';

const CATEGORY_LABELS: Record<string, string> = {
  catching: 'Catching loop',
  variety: 'Variety',
  dedication: 'Dedication',
  fursuiter: 'Fursuiter-side',
  fun: 'Fun & social',
  meta: 'Meta',
};

const RECIPIENT_LABELS: Record<string, string> = {
  catcher: 'Earned while catching',
  fursuit_owner: 'Earned as a suit owner',
  any: 'Earned through app actions',
};

const formatUnlockedAt = (iso: string | null) => {
  if (!iso) {
    return null;
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const groupByCategory = (achievements: AchievementWithStatus[]) => {
  return achievements.reduce<Record<string, AchievementWithStatus[]>>((acc, achievement) => {
    const category = achievement.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(achievement);
    return acc;
  }, {});
};

export default function AchievementsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const achievementsQueryKey = useMemo(
    () => (userId ? achievementsStatusQueryKey(userId) : ['achievements-status', 'guest'] as const),
    [userId]
  );

  const {
    data: achievements = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<AchievementWithStatus[], Error>({
    queryKey: achievementsQueryKey,
    enabled: Boolean(userId),
    queryFn: () => fetchAchievementStatus(userId ?? ''),
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useAchievementsRealtime(userId);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const unlocked = useMemo(
    () => achievements.filter((achievement) => achievement.unlocked),
    [achievements]
  );
  const locked = useMemo(
    () => achievements.filter((achievement) => !achievement.unlocked),
    [achievements]
  );

  const unlockedCount = unlocked.length;
  const totalCount = achievements.length;
  const progressPercent = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

  const latestUnlock = useMemo(() => {
    if (unlocked.length === 0) {
      return null;
    }

    return [...unlocked].sort((a, b) => {
      const aTime = a.unlockedAt ? new Date(a.unlockedAt).getTime() : 0;
      const bTime = b.unlockedAt ? new Date(b.unlockedAt).getTime() : 0;
      return bTime - aTime;
    })[0];
  }, [unlocked]);

  const groupedLocked = useMemo(() => groupByCategory(locked), [locked]);
  const groupedUnlocked = useMemo(() => groupByCategory(unlocked), [unlocked]);

  const isRefreshing = isFetching && !isLoading;

  const handleRetry = useCallback(() => {
    void refetch({ throwOnError: false });
  }, [refetch]);

  const handleComingSoon = useCallback(() => {
    Alert.alert('Keep exploring!', 'More achievements will unlock as you keep playing.');
  }, []);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            void refetch({ throwOnError: false });
          }}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.headerRow}>
        <TailTagButton variant="ghost" onPress={handleBack}>
          Back
        </TailTagButton>
      </View>

      <TailTagCard style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryEyebrow}>Achievements</Text>
          <Text style={styles.summaryTitle}>Your progress</Text>
        </View>

        {isLoading ? (
          <Text style={styles.message}>Loading achievements…</Text>
        ) : error ? (
          <View style={styles.errorBlock}>
            <Text style={styles.errorText}>{error.message}</Text>
            <TailTagButton variant="outline" size="sm" onPress={handleRetry}>
              Try again
            </TailTagButton>
          </View>
        ) : achievements.length === 0 ? (
          <View style={styles.helperBlock}>
            <Text style={styles.message}>No achievements available yet.</Text>
            <TailTagButton variant="outline" size="sm" onPress={handleComingSoon}>
              Stay tuned
            </TailTagButton>
          </View>
        ) : (
          <View style={styles.summaryContent}>
            <View>
              <Text style={styles.progressHeadline}>
                {unlockedCount} / {totalCount} unlocked
              </Text>
              <Text style={styles.progressSubhead}>
                {progressPercent}% complete{latestUnlock ? ` · Last unlock: ${latestUnlock.name}` : ''}
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(Math.max(progressPercent, 0), 100)}%` },
                ]}
              />
            </View>
          </View>
        )}
      </TailTagCard>

      {!isLoading && !error ? (
        <TailTagCard>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Unlocked</Text>
            {unlocked.length === 0 ? (
              <Text style={styles.message}>Start catching suits to earn your first badge.</Text>
            ) : (
              Object.entries(groupedUnlocked).map(([category, items]) => (
                <View key={category} style={styles.categoryBlock}>
                  <Text style={styles.categoryLabel}>{CATEGORY_LABELS[category] ?? category}</Text>
                  {items.map((achievement) => (
                    <AchievementRow key={achievement.id} achievement={achievement} unlocked />
                  ))}
                </View>
              ))
            )}
          </View>

          <View style={styles.sectionDivider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Locked</Text>
            {locked.length === 0 ? (
              <Text style={styles.message}>You've unlocked every achievement available today. 🎉</Text>
            ) : (
              Object.entries(groupedLocked).map(([category, items]) => (
                <View key={category} style={styles.categoryBlock}>
                  <Text style={styles.categoryLabel}>{CATEGORY_LABELS[category] ?? category}</Text>
                  {items.map((achievement) => (
                    <AchievementRow key={achievement.id} achievement={achievement} unlocked={false} />
                  ))}
                </View>
              ))
            )}
          </View>
        </TailTagCard>
      ) : null}
    </ScrollView>
  );
}

function AchievementRow({
  achievement,
  unlocked,
}: {
  achievement: AchievementWithStatus;
  unlocked: boolean;
}) {
  const unlockedAt = formatUnlockedAt(achievement.unlockedAt ?? null);

  return (
    <View style={[styles.achievementRow, unlocked ? styles.achievementUnlocked : styles.achievementLocked]}>
      <View style={styles.achievementContent}>
        <Text style={styles.achievementName}>{achievement.name}</Text>
        <Text style={styles.achievementDescription}>{achievement.description}</Text>
        <Text style={styles.achievementMeta}>
          {RECIPIENT_LABELS[achievement.recipientRole] ?? 'General'} ·{' '}
          {CATEGORY_LABELS[achievement.category] ?? achievement.category}
        </Text>
        {unlocked && unlockedAt ? (
          <Text style={styles.achievementUnlockedAt}>Unlocked on {unlockedAt}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  summaryCard: {
    gap: spacing.md,
  },
  summaryHeader: {
    gap: spacing.xs,
  },
  summaryEyebrow: {
    color: 'rgba(148,163,184,0.8)',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  summaryTitle: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: '700',
  },
  summaryContent: {
    gap: spacing.md,
  },
  progressHeadline: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '700',
  },
  progressSubhead: {
    color: 'rgba(203,213,225,0.85)',
    fontSize: 14,
  },
  progressBar: {
    height: 10,
    width: '100%',
    borderRadius: radius.lg,
    backgroundColor: 'rgba(148,163,184,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  message: {
    color: 'rgba(203,213,225,0.85)',
    fontSize: 14,
  },
  errorBlock: {
    gap: spacing.sm,
  },
  helperBlock: {
    gap: spacing.sm,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(148,163,184,0.18)',
    marginVertical: spacing.md,
  },
  categoryBlock: {
    gap: spacing.sm,
  },
  categoryLabel: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  achievementRow: {
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  achievementUnlocked: {
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.35)',
  },
  achievementLocked: {
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
  },
  achievementContent: {
    gap: spacing.xs,
  },
  achievementName: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  achievementDescription: {
    color: 'rgba(203,213,225,0.85)',
    fontSize: 14,
  },
  achievementMeta: {
    color: 'rgba(148,163,184,0.85)',
    fontSize: 13,
  },
  achievementUnlockedAt: {
    color: colors.primary,
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});
