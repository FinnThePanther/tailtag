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
  isConvention: boolean;
  byCategory: Record<string, AchievementWithStatus[]>;
};

function groupByConventionAndCategory(achievements: AchievementWithStatus[]): AchievementGroup[] {
  const globalGroup: AchievementGroup = {
    key: 'global',
    label: 'Global',
    isConvention: false,
    byCategory: {},
  };
  const conventionGroups = new Map<string, AchievementGroup>();

  for (const achievement of achievements) {
    if (achievement.conventionId === null) {
      if (!globalGroup.byCategory[achievement.category]) {
        globalGroup.byCategory[achievement.category] = [];
      }
      globalGroup.byCategory[achievement.category].push(achievement);
    } else {
      if (!conventionGroups.has(achievement.conventionId)) {
        conventionGroups.set(achievement.conventionId, {
          key: achievement.conventionId,
          label: achievement.conventionName ?? 'Convention',
          isConvention: true,
          byCategory: {},
        });
      }
      const group = conventionGroups.get(achievement.conventionId)!;
      if (!group.byCategory[achievement.category]) {
        group.byCategory[achievement.category] = [];
      }
      group.byCategory[achievement.category].push(achievement);
    }
  }

  const groups: AchievementGroup[] = [];
  if (Object.keys(globalGroup.byCategory).length > 0) {
    groups.push(globalGroup);
  }
  const sortedConventions = [...conventionGroups.values()].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  groups.push(...sortedConventions);
  return groups;
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

  const groupedUnlocked = useMemo(() => groupByConventionAndCategory(unlocked), [unlocked]);
  const groupedLocked = useMemo(() => groupByConventionAndCategory(locked), [locked]);

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
              <Text style={styles.errorText}>{error.message}</Text>
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
      {group.isConvention ? (
        <View style={styles.conventionHeader}>
          <Text style={styles.conventionBadge}>{group.label}</Text>
        </View>
      ) : null}
      {Object.entries(group.byCategory).map(([category, items]) => (
        <View
          key={category}
          style={styles.categoryBlock}
        >
          <Text style={styles.categoryLabel}>{CATEGORY_LABELS[category] ?? category}</Text>
          {items.map((achievement) => (
            <AchievementRow
              key={achievement.id}
              achievement={achievement}
              unlocked={unlocked}
              isConvention={group.isConvention}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function AchievementRow({
  achievement,
  unlocked,
  isConvention,
}: {
  achievement: AchievementWithStatus;
  unlocked: boolean;
  isConvention: boolean;
}) {
  const unlockedAt = formatUnlockedAt(achievement.unlockedAt ?? null);

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
        <Text style={styles.achievementMeta}>
          {RECIPIENT_LABELS[achievement.recipientRole] ?? 'General'}
          {isConvention
            ? ` · ${CATEGORY_LABELS[achievement.category] ?? achievement.category}`
            : ''}
        </Text>
        {unlocked && unlockedAt ? (
          <Text style={styles.achievementUnlockedAt}>Unlocked on {unlockedAt}</Text>
        ) : null}
      </View>
    </View>
  );
}
