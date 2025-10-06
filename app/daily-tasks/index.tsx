import { useCallback, useMemo } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { TailTagProgressBar } from '../../src/components/ui/TailTagProgressBar';
import { useAuth } from '../../src/features/auth';
import { useDailyTasks, type DailyTaskProgress } from '../../src/features/daily-tasks';
import { colors, radius, spacing } from '../../src/theme';

function formatDayLabel(day: string): string {
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return day;
  }

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

function formatCompletionTime(iso: string | null): string {
  if (!iso) {
    return '';
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function getTaskStatusCopy(task: DailyTaskProgress): string {
  const remaining = Math.max(task.requirement - task.currentCount, 0);
  if (task.isCompleted) {
    return 'Completed';
  }

  if (remaining === 0) {
    return 'Ready to claim';
  }

  return `${remaining} to go`;
}

export default function DailyTasksScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
    countdown,
    day,
  } = useDailyTasks(userId);

  const tasks = data?.tasks ?? [];
  const totalCount = data?.totalCount ?? 0;
  const completedCount = data?.completedCount ?? 0;
  const streak = data?.streak ?? { current: 0, best: 0, lastCompletedDay: null };
  const allComplete = totalCount > 0 && completedCount === totalCount;
  const progressValue = totalCount > 0 ? completedCount / totalCount : 0;

  const formattedDay = useMemo(() => formatDayLabel(day), [day]);
  const remainingCount = Math.max(totalCount - completedCount, 0);
  const isRefreshing = isFetching && !isLoading;

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleRetry = useCallback(() => {
    void refetch({ throwOnError: false });
  }, [refetch]);

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
          <Text style={styles.summaryEyebrow}>Daily Tasks</Text>
          <Text style={styles.summaryTitle}>{formattedDay}</Text>
        </View>

        <View style={styles.summaryStatsRow}>
          <View style={styles.summaryStat}>
            <Text style={styles.statLabel}>Completed</Text>
            <Text style={styles.statValue}>
              {completedCount} / {totalCount}
            </Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={styles.statLabel}>Current streak</Text>
            <Text style={styles.statValue}>{streak.current}</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={styles.statLabel}>Best streak</Text>
            <Text style={styles.statValue}>{streak.best}</Text>
          </View>
        </View>

        <View style={styles.progressBlock}>
          <TailTagProgressBar value={progressValue} />
          <View style={styles.progressFooter}>
            <Text style={styles.progressHelper}>
              {totalCount === 0
                ? "Today's lineup is being prepared."
                : allComplete
                ? 'All tasks complete - great job!'
                : `${remainingCount} task${remainingCount === 1 ? '' : 's'} remaining`}
            </Text>
            <Text style={styles.countdownLabel}>Resets in {countdown}</Text>
          </View>
        </View>
      </TailTagCard>

      <TailTagCard style={styles.tasksCard}>
        <Text style={styles.tasksTitle}>Today's tasks</Text>

        {isLoading ? (
          <Text style={styles.message}>Loading daily tasks...</Text>
        ) : error ? (
          <View style={styles.errorBlock}>
            <Text style={styles.errorText}>{error.message}</Text>
            <TailTagButton variant="outline" size="sm" onPress={handleRetry}>
              Try again
            </TailTagButton>
          </View>
        ) : tasks.length === 0 ? (
          <Text style={styles.message}>No tasks available right now. Check back shortly.</Text>
        ) : (
          <View style={styles.tasksList}>
            {tasks.map((task) => {
              const progressFraction = task.requirement > 0 ? Math.min(task.currentCount / task.requirement, 1) : 0;
              const clampedCount = Math.min(task.currentCount, task.requirement);
              const progressLabel = `${clampedCount} / ${task.requirement}`;
              const completionTime = task.isCompleted ? formatCompletionTime(task.completedAt) : '';

              return (
                <View key={task.id} style={styles.taskRow}>
                  <View style={styles.taskHeader}>
                    <Text style={styles.taskTitle}>{task.name}</Text>
                    <Text style={task.isCompleted ? styles.taskBadgeDone : styles.taskBadgePending}>
                      {getTaskStatusCopy(task)}
                    </Text>
                  </View>
                  <Text style={styles.taskDescription}>{task.description}</Text>
                  <TailTagProgressBar value={progressFraction} style={styles.taskProgress} />
                  <View style={styles.taskFooter}>
                    <Text style={styles.taskProgressLabel}>{progressLabel}</Text>
                    {completionTime ? (
                      <Text style={styles.taskCompletionLabel}>Completed at {completionTime}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </TailTagCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  summaryCard: {
    gap: spacing.lg,
  },
  summaryHeader: {
    gap: spacing.xs,
  },
  summaryEyebrow: {
    color: colors.slate200,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  summaryTitle: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: '600',
  },
  summaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryStat: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statLabel: {
    color: colors.slate200,
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  statValue: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '600',
  },
  progressBlock: {
    gap: spacing.sm,
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressHelper: {
    color: colors.slate200,
    fontSize: 14,
  },
  countdownLabel: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  tasksCard: {
    gap: spacing.md,
  },
  tasksTitle: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '600',
  },
  message: {
    color: colors.slate200,
    fontSize: 14,
  },
  errorBlock: {
    gap: spacing.sm,
  },
  errorText: {
    color: colors.destructive,
    fontSize: 14,
    fontWeight: '500',
  },
  tasksList: {
    gap: spacing.md,
  },
  taskRow: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: spacing.sm,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  taskTitle: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  taskBadgePending: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '600',
  },
  taskBadgeDone: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  taskDescription: {
    color: colors.slate200,
    fontSize: 14,
  },
  taskProgress: {
    backgroundColor: 'rgba(148,163,184,0.18)',
  },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskProgressLabel: {
    color: colors.slate200,
    fontSize: 14,
    fontWeight: '500',
  },
  taskCompletionLabel: {
    color: colors.slate200,
    fontSize: 12,
  },
});
