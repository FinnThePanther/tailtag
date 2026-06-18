import { useCallback, useMemo } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { useAuth } from '../../src/features/auth';
import {
  achievementsStatusQueryKey,
  fetchAchievementStatus,
  type AchievementWithStatus,
} from '../../src/features/achievements';
import { getUserVisibleErrorMessage } from '@/lib/userVisibleErrors';
import { colors } from '../../src/theme';
import { styles } from '../../src/app-styles/achievements/index.styles';

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

type AchievementGroup = {
  key: string;
  label: string;
  items: AchievementWithStatus[];
};

function groupByCategory(achievements: AchievementWithStatus[]): AchievementGroup[] {
  const byCategory = new Map<string, AchievementGroup>();

  for (const achievement of achievements) {
    if (!byCategory.has(achievement.category)) {
      byCategory.set(achievement.category, {
        key: achievement.category,
        label: CATEGORY_LABELS[achievement.category] ?? achievement.category,
        items: [],
      });
    }

    byCategory.get(achievement.category)!.items.push(achievement);
  }

  return [...byCategory.values()];
}

export default function AchievementsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const achievementsQueryKey = useMemo(
    () =>
      userId ? achievementsStatusQueryKey(userId) : (['achievements-status', 'guest'] as const),
    [userId],
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

  const unlocked = useMemo(
    () => achievements.filter((achievement) => achievement.unlocked),
    [achievements],
  );
  const locked = useMemo(
    () => achievements.filter((achievement) => !achievement.unlocked),
    [achievements],
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

  const groupedUnlocked = useMemo(() => groupByCategory(unlocked), [unlocked]);
  const groupedLocked = useMemo(() => groupByCategory(locked), [locked]);

  const isRefreshing = isFetching && !isLoading;

  const handleRetry = useCallback(() => {
    void refetch({ throwOnError: false });
  }, [refetch]);

  const handleComingSoon = useCallback(() => {
    Alert.alert('Keep exploring!', 'More achievements will unlock as you keep playing.');
  }, []);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Achievements"
        onBack={() => router.back()}
      />
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
        <TailTagCard style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryEyebrow}>Achievements</Text>
            <Text style={styles.summaryTitle}>Your progress</Text>
          </View>

          {isLoading ? (
            <Text style={styles.message}>Loading achievements…</Text>
          ) : error ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorText}>
                {getUserVisibleErrorMessage(error, "We couldn't load achievements.")}
              </Text>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={handleRetry}
              >
                Try again
              </TailTagButton>
            </View>
          ) : achievements.length === 0 ? (
            <View style={styles.helperBlock}>
              <Text style={styles.message}>No achievements available yet.</Text>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={handleComingSoon}
              >
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
                  {progressPercent}% complete
                  {latestUnlock ? ` · Last unlock: ${latestUnlock.name}` : ''}
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
                groupedUnlocked.map((group) => (
                  <AchievementGroupSection
                    key={group.key}
                    group={group}
                    unlocked
                  />
                ))
              )}
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Locked</Text>
              {locked.length === 0 ? (
                <Text style={styles.message}>
                  You've unlocked every achievement available today. 🎉
                </Text>
              ) : (
                groupedLocked.map((group) => (
                  <AchievementGroupSection
                    key={group.key}
                    group={group}
                    unlocked={false}
                  />
                ))
              )}
            </View>
          </TailTagCard>
        ) : null}
      </ScrollView>
    </View>
  );
}

function AchievementGroupSection({
  group,
  unlocked,
}: {
  group: AchievementGroup;
  unlocked: boolean;
}) {
  return (
    <View style={styles.groupBlock}>
      <Text style={styles.categoryLabel}>{group.label}</Text>
      {group.items.map((achievement) => (
        <AchievementRow
          key={achievement.id}
          achievement={achievement}
          unlocked={unlocked}
        />
      ))}
    </View>
  );
}

function getConventionContextLabel(achievement: AchievementWithStatus, unlocked: boolean) {
  if (!achievement.conventionId) {
    return null;
  }

  if (!unlocked) {
    return 'Convention exclusive';
  }

  return achievement.conventionName
    ? `Earned at ${achievement.conventionName}`
    : 'Earned at a convention';
}

function AchievementRow({
  achievement,
  unlocked,
}: {
  achievement: AchievementWithStatus;
  unlocked: boolean;
}) {
  const unlockedAt = formatUnlockedAt(achievement.unlockedAt ?? null);
  const metaParts = [
    RECIPIENT_LABELS[achievement.recipientRole] ?? 'General',
    getConventionContextLabel(achievement, unlocked),
  ].filter(Boolean);

  return (
    <View
      style={[
        styles.achievementRow,
        unlocked ? styles.achievementUnlocked : styles.achievementLocked,
      ]}
    >
      <View style={styles.achievementContent}>
        <Text style={styles.achievementName}>{achievement.name}</Text>
        <Text style={styles.achievementDescription}>{achievement.description}</Text>
        <Text style={styles.achievementMeta}>{metaParts.join(' · ')}</Text>
        {unlocked && unlockedAt ? (
          <Text style={styles.achievementUnlockedAt}>Unlocked on {unlockedAt}</Text>
        ) : null}
      </View>
    </View>
  );
}
